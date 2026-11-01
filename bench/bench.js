// bench/bench.js — per-mode benchmark (npm run bench).
// For each mode: 1,000 frames encrypted (Alice) and decrypted+checked (Bob) in Node.js,
// using exactly the same shared/ code as the browser. Also measures how much each mode
// leaks (ECB leak meter) and how many attacked frames Bob rejects.
// Writes docs/results/bench.csv and docs/results/RESULTS.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setAesJs } from '../shared/ecb.js';
import { MODES, MODE_IDS, generateKeyPair, deriveSessionKeys, safetyNumber } from '../shared/crypto.js';
import { createSenderSession, buildFrame } from '../shared/sender.js';
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { syntheticFrames, leakPercent, FRAME_BYTES } from '../shared/frame.js';
import { makeStampMask } from '../shared/stamps.js';
import { applyBitflip, createMitm } from '../server/eve-active.js';

setAesJs(createRequire(import.meta.url)('aes-js'));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'results');
const N = parseInt(process.env.BENCH_FRAMES || '1000', 10);

const frames = syntheticFrames(60);
const mask = makeStampMask('star');
const sid = 'bench';
const a = await generateKeyPair(), b = await generateKeyPair();
const ka = await deriveSessionKeys(a.privateKey, b.pubRaw, sid);
const kb = await deriveSessionKeys(b.privateKey, a.pubRaw, sid);
const IV_BYTES = { plain: 0, ecb: 0, cbc: 16, ctr: 16, 'ctr-reuse': 16, 'ctr-hmac': 16, gcm: 12 };

const rows = [];
for (const mode of MODE_IDS) {
  const tx = createSenderSession({ sid, mode, keys: ka });
  // --- encrypt
  const built = [];
  let t0 = performance.now();
  for (let i = 0; i < N; i++) built.push(await buildFrame(tx, frames[i % frames.length], i));
  const encMs = (performance.now() - t0) / N;
  // --- decrypt (+ checks)
  const rx = createReceiverState({ sid, keys: kb });
  t0 = performance.now();
  let okCount = 0;
  for (const f of built) if ((await receiveFrame(rx, f.headerBytes, f.payload)).ok) okCount++;
  const decMs = (performance.now() - t0) / N;
  if (okCount !== N) throw new Error(`${mode}: only ${okCount}/${N} frames decrypted`);
  // --- leak meter (average over the live frames)
  let leak = 0;
  for (const f of built.slice(0, 60)) leak += leakPercent(f.payload);
  leak /= 60;
  // --- bit-flip attack: fraction of tampered frames Bob rejects
  const rxB = createReceiverState({ sid, keys: kb });
  let rejB = 0;
  for (const f of built.slice(0, 100)) if (!(await receiveFrame(rxB, f.headerBytes, applyBitflip(mode, f.payload, mask))).ok) rejB++;
  // --- replay attack: Bob saw frames 100..199, then Eve replays frames 0..99
  const rxR = createReceiverState({ sid, keys: kb });
  for (const f of built.slice(100, 200)) await receiveFrame(rxR, f.headerBytes, f.payload);
  let rejR = 0;
  for (const f of built.slice(0, 100)) if (!(await receiveFrame(rxR, f.headerBytes, f.payload)).ok) rejR++;
  const overhead = built[0].payload.length - FRAME_BYTES + IV_BYTES[mode];
  rows.push({
    mode, label: MODES[mode].label,
    enc_ms_per_frame: encMs, dec_ms_per_frame: decMs,
    enc_MBps: FRAME_BYTES / 1e6 / (encMs / 1000), dec_MBps: FRAME_BYTES / 1e6 / (decMs / 1000),
    overhead_bytes: overhead, leak_percent: leak,
    bitflip_reject_percent: rejB, replay_reject_percent: rejR,
  });
  console.log(`${mode.padEnd(10)} enc ${encMs.toFixed(3)} ms  dec ${decMs.toFixed(3)} ms  overhead ${overhead} B  leak ${leak.toFixed(1)} %  bit-flip rejected ${rejB} %  replay rejected ${rejR} %`);
}

// --- MITM: Bob accepts (100 %), only the safety number reveals it.
const eve = await createMitm('bench-mitm');
const toBob = await eve.onHello('alice', a.pubRaw);
const toAlice = await eve.onHello('bob', b.pubRaw);
const kA = await deriveSessionKeys(a.privateKey, toAlice, 'bench-mitm');
const kB = await deriveSessionKeys(b.privateKey, toBob, 'bench-mitm');
const txM = createSenderSession({ sid: 'bench-mitm', mode: 'gcm', keys: kA });
const rxM = createReceiverState({ sid: 'bench-mitm', keys: kB });
let mitmOk = 0;
for (let i = 0; i < 100; i++) {
  const f = await buildFrame(txM, frames[i % frames.length], i);
  const t = await eve.transform(f.headerBytes, f.payload);
  if ((await receiveFrame(rxM, t.forward.headerBytes, t.forward.payload)).ok) mitmOk++;
}
const snA = await safetyNumber(a.pubRaw, toAlice), snB = await safetyNumber(toBob, b.pubRaw);
console.log(`MITM (gcm): Bob accepted ${mitmOk}/100 re-encrypted frames; safety numbers ${snA} vs ${snB} → ${snA === snB ? 'MATCH' : 'MISMATCH (Eve detected)'}`);

// --- write results
fs.mkdirSync(OUT, { recursive: true });
const cols = Object.keys(rows[0]);
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : `"${v}"`);
fs.writeFileSync(path.join(OUT, 'bench.csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => fmt(r[c])).join(','))].join('\n') + '\n');

const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
let md = `# CipherCam — benchmark results

Generated by \`npm run bench\` on ${new Date().toISOString().slice(0, 10)} — ${os.cpus()[0]?.model || 'unknown CPU'} (${os.cpus().length} threads), Node.js ${process.version}, ${process.platform}.
${N} frames of 160×120 grayscale (19,200 bytes) per mode, same \`shared/\` code as the browser.

| Mode | Encrypt ms/frame | Decrypt ms/frame | Encrypt MB/s | Overhead bytes/frame (IV + tag + padding) | Leak meter (avg) | Bit-flip frames rejected | Replayed frames rejected |
|---|---:|---:|---:|---:|---:|---:|---:|
`;
for (const r of rows) md += `| \`${r.mode}\` ${r.label} | ${f2(r.enc_ms_per_frame)} | ${f2(r.dec_ms_per_frame)} | ${f1(r.enc_MBps)} | ${r.overhead_bytes} | ${f1(r.leak_percent)} % | ${r.bitflip_reject_percent} % | ${r.replay_reject_percent} % |\n`;
md += `
**MITM (AES-GCM):** Bob accepted ${mitmOk}/100 frames that Eve decrypted and re-encrypted. The safety numbers were \`${snA}\` (Alice) and \`${snB}\` (Bob): ${snA === snB ? 'MATCH' : '**MISMATCH** — only this human check reveals Eve'}.

**Browser frame rate:** see \`e2e-fps.json\` (measured by \`npm run e2e\` with all three Stage panels open).

## What the numbers say

1. **Speed is not the problem.** Even the slowest mode needs about ${f2(Math.max(...rows.map((r) => r.enc_ms_per_frame)))} ms to encrypt a frame, far below the 100 ms budget of a 10 fps call. AES-GCM costs ${f2(by.gcm.enc_ms_per_frame)} ms vs ${f2(by.ctr.enc_ms_per_frame)} ms for plain CTR, so the secure mode is essentially free. (ECB runs in the pure-JavaScript aes-js library, so it is the slowest here; Web Crypto modes use native AES.)
2. **Only ECB leaks.** The leak meter reads ${f1(by.ecb.leak_percent)} % for ECB (the same as no encryption, ${f1(by.plain.leak_percent)} %), because identical 4×4 tiles give identical ciphertext blocks. Every randomized mode reads ${f1(Math.max(by.cbc.leak_percent, by.ctr.leak_percent, by.gcm.leak_percent))} %. Note that the buggy \`ctr-reuse\` mode also reads ${f1(by['ctr-reuse'].leak_percent)} %: inside ONE frame its keystream still looks random. Its flaw only appears ACROSS frames (C₁ ⊕ C₂ = P₁ ⊕ P₂), which is why Eve needs the keystream-recovery view to exploit it.
3. **Encryption is not integrity.** With no MAC, 0 % of bit-flipped and 0 % of replayed frames are rejected (CBC turns the stamp into garbage but still shows it). With CTR+HMAC or AES-GCM, ${by['ctr-hmac'].bitflip_reject_percent} % / ${by.gcm.bitflip_reject_percent} % of tampered frames and ${by['ctr-hmac'].replay_reject_percent} % / ${by.gcm.replay_reject_percent} % of replayed frames are rejected, for an overhead of only ${by['ctr-hmac'].overhead_bytes} / ${by.gcm.overhead_bytes} bytes per frame.
4. **Nothing in the frames stops a MITM.** Bob accepted every re-encrypted GCM frame; key authentication (the safety-number check) is the only defence.
`;
fs.writeFileSync(path.join(OUT, 'RESULTS.md'), md);
console.log(`\nWrote ${path.relative(ROOT, path.join(OUT, 'bench.csv'))} and ${path.relative(ROOT, path.join(OUT, 'RESULTS.md'))}`);
