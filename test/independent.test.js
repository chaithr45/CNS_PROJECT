// test/independent.test.js — an INDEPENDENT check of all five attacks and their fixes.
//
// Who is who in this test:
//   * Alice  = the app's own sender code (shared/sender.js + shared/crypto.js), exactly what
//              the browser runs.
//   * Relay  = the REAL CipherCam server, with Eve's REAL active attacks (server/eve-active.js).
//   * Bob and Eve's analysis = written again here FROM THE SPEC, using only node:crypto
//              (OpenSSL): its own ECDH P-256, HKDF-SHA256, AES-ECB/CBC/CTR/GCM, HMAC-SHA256,
//              safety number, tile layout and wire format. Nothing from shared/crypto.js.
//
// So if the app's crypto were fake (or merely self-consistent), this test would fail:
//   1. every frame on the wire must be byte-identical to what OpenSSL produces;
//   2. every attack must have its effect on the real bytes, judged by the independent Bob;
//   3. on every single frame, the app's own receiver (shared/receiver.js) must reach the same
//      verdict (accepted / tampered / replayed) as the independent Bob.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import './helpers.js';
import { createCipherServer } from '../server/app.js';
import { simAlice, connect, waitFor } from './sim-clients.js';
import { syntheticFrames, makeSplashFrame, SPLASH_FRAMES } from '../shared/frame.js';
// Used ONLY as the thing being compared against (the app's Bob), and to turn the
// independently derived raw key bytes into Web Crypto key objects for it.
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { importSessionKeys } from '../shared/crypto.js';

const FRAME_BYTES = 19200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = syntheticFrames(40);
const splash = makeSplashFrame();

// ---------------------------------------------------------------- independent primitives
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const xor = (a, b) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i]; return o; };

// Wire format: [u32 BE header length][header JSON][payload]
function encodeMsg(header) { const hb = Buffer.from(JSON.stringify(header)); const len = Buffer.alloc(4); len.writeUInt32BE(hb.length); return Buffer.concat([len, hb]); }
function decodeMsg(buf) {
  const len = buf.readUInt32BE(0);
  const headerBytes = buf.subarray(4, 4 + len);
  return { header: JSON.parse(headerBytes.toString('utf8')), headerBytes, payload: buf.subarray(4 + len) };
}

// Tile layout from the spec: each 16-byte AES block = one 4×4 tile, tiles in row order.
function tiles(px) {
  const out = Buffer.alloc(FRAME_BYTES); let o = 0;
  for (let ty = 0; ty < 30; ty++) for (let tx = 0; tx < 40; tx++) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[o++] = px[(ty * 4 + r) * 160 + tx * 4 + c];
  return out;
}
function untiles(b) {
  const out = Buffer.alloc(FRAME_BYTES); let o = 0;
  for (let ty = 0; ty < 30; ty++) for (let tx = 0; tx < 40; tx++) for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[(ty * 4 + r) * 160 + tx * 4 + c] = b[o++];
  return out;
}
// % of the 1,200 blocks that are an exact copy of another block in the same frame.
function dupPercent(ct) {
  const count = new Map();
  for (let b = 0; b < 1200; b++) { const k = ct.subarray(b * 16, b * 16 + 16).toString('hex'); count.set(k, (count.get(k) || 0) + 1); }
  let dup = 0;
  for (const n of count.values()) if (n > 1) dup += n;
  return (dup * 100) / 1200;
}

// Safety number: SHA-256("CipherCam safety" ‖ min(pub) ‖ max(pub)), first 6 bytes → 12 digits.
function safety(pubA, pubB) {
  const [lo, hi] = Buffer.compare(pubA, pubB) <= 0 ? [pubA, pubB] : [pubB, pubA];
  const h = sha256(Buffer.concat([Buffer.from('CipherCam safety'), lo, hi]));
  const d = String(h.readUIntBE(0, 6) % 1e12).padStart(12, '0');
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
}
// ECDH P-256 + HKDF-SHA256(salt = SHA-256(sid), info = "CipherCam v1 keys") → 52 bytes.
function deriveKeys(ecdh, peerPub, sid) {
  const shared = ecdh.computeSecret(peerPub);
  const okm = Buffer.from(crypto.hkdfSync('sha256', shared, sha256(Buffer.from(sid, 'utf8')), Buffer.from('CipherCam v1 keys'), 52));
  return { aesKey: okm.subarray(0, 16), macKey: okm.subarray(16, 48), nonceSalt: okm.subarray(48, 52) };
}
const gcmNonce = (salt, seq) => { const n = Buffer.alloc(12); salt.copy(n, 0); n.writeBigUInt64BE(BigInt(seq), 4); return n; };
function run(cipher, data) { return Buffer.concat([cipher.update(data), cipher.final()]); }
const enc = (alg, key, iv, data, pad = false) => { const c = crypto.createCipheriv(alg, key, iv); c.setAutoPadding(pad); return run(c, data); };
const dec = (alg, key, iv, data, pad = false) => { const d = crypto.createDecipheriv(alg, key, iv); d.setAutoPadding(pad); return run(d, data); };

// What the payload of this frame MUST be, computed by OpenSSL from the plaintext.
function opensslEncrypt(k, header, headerBytes, pt) {
  const iv = header.iv ? Buffer.from(header.iv, 'base64') : null;
  switch (header.mode) {
    case 'plain': return pt;
    case 'ecb': return enc('aes-128-ecb', k.aesKey, null, pt);
    case 'cbc': return enc('aes-128-cbc', k.aesKey, iv, pt, true);          // PKCS#7 padding
    case 'ctr': case 'ctr-reuse': return enc('aes-128-ctr', k.aesKey, iv, pt);
    case 'ctr-hmac': {
      const ct = enc('aes-128-ctr', k.aesKey, iv, pt);
      return Buffer.concat([ct, crypto.createHmac('sha256', k.macKey).update(headerBytes).update(ct).digest()]);
    }
    case 'gcm': {
      const c = crypto.createCipheriv('aes-128-gcm', k.aesKey, gcmNonce(k.nonceSalt, header.seq));
      c.setAAD(headerBytes);
      const ct = run(c, pt);
      return Buffer.concat([ct, c.getAuthTag()]);
    }
    default: throw new Error(header.mode);
  }
}

// Bob's checks, written from the spec (section 7): tag first, then seq > lastSeq.
function independentReceive(rx, headerBytes, payload) {
  const h = JSON.parse(headerBytes.toString('utf8'));
  const { mode, seq } = h;
  const k = rx.keys;
  if (mode !== 'plain' && !k) return { ok: false, kind: 'nokey', seq };
  const iv = h.iv ? Buffer.from(h.iv, 'base64') : null;
  let pt; let tagOk = null;
  try {
    if (mode === 'plain') pt = payload.subarray(0, FRAME_BYTES);
    else if (mode === 'ecb') pt = dec('aes-128-ecb', k.aesKey, null, payload.subarray(0, FRAME_BYTES));
    else if (mode === 'cbc') pt = dec('aes-128-cbc', k.aesKey, iv, payload, true);
    else if (mode === 'ctr' || mode === 'ctr-reuse') pt = dec('aes-128-ctr', k.aesKey, iv, payload);
    else if (mode === 'ctr-hmac') {
      const ct = payload.subarray(0, payload.length - 32);
      const want = crypto.createHmac('sha256', k.macKey).update(headerBytes).update(ct).digest();
      tagOk = crypto.timingSafeEqual(want, payload.subarray(payload.length - 32));
      if (!tagOk) return { ok: false, kind: 'tamper', seq, tagOk };
      pt = dec('aes-128-ctr', k.aesKey, iv, ct);
    } else if (mode === 'gcm') {
      const d = crypto.createDecipheriv('aes-128-gcm', k.aesKey, gcmNonce(k.nonceSalt, seq));
      d.setAAD(headerBytes);
      d.setAuthTag(payload.subarray(payload.length - 16));
      try { pt = run(d, payload.subarray(0, payload.length - 16)); tagOk = true; } catch { return { ok: false, kind: 'tamper', seq, tagOk: false }; }
    }
  } catch { return { ok: false, kind: 'decrypt', seq }; }
  if ((mode === 'gcm' || mode === 'ctr-hmac') && seq <= rx.lastSeq) return { ok: false, kind: 'replay', seq, tagOk };
  if (seq > rx.lastSeq) rx.lastSeq = seq;
  return { ok: true, seq, tiles: pt, tagOk };
}

// ---------------------------------------------------------------- independent clients
function independentBob(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=bob`);
  const b = { sid: null, ecdh: null, keys: null, appRx: null, rx: null, safety: null, peerPub: null, results: [] };
  let chain = Promise.resolve();
  const hello = () => ws.send(encodeMsg({ t: 'hello', sid: b.sid, role: 'bob', pub: b.ecdh.getPublicKey().toString('base64') }));
  ws.on('message', (data) => {
    const m = decodeMsg(Buffer.from(data));
    const h = m.header;
    if (h.t === 'state' && h.state.sid !== b.sid) {
      b.sid = h.state.sid; b.keys = null; b.safety = null; b.peerPub = null; b.results = [];
      b.ecdh = crypto.createECDH('prime256v1');               // fresh P-256 key pair per session
      b.ecdh.generateKeys();
      b.rx = { keys: null, lastSeq: -1 };
      b.appRx = createReceiverState({ sid: b.sid });
      hello();
    } else if (h.t === 'hello' && h.role === 'alice' && h.sid === b.sid) {
      const sid = b.sid;
      const peer = Buffer.from(h.pub, 'base64');
      const keys = deriveKeys(b.ecdh, peer, sid);
      chain = chain.then(async () => {
        const app = await importSessionKeys({ aesKey: new Uint8Array(keys.aesKey), macKey: new Uint8Array(keys.macKey), nonceSalt: new Uint8Array(keys.nonceSalt) });
        if (sid !== b.sid) return;
        b.peerPub = peer; b.keys = keys; b.rx.keys = keys; b.appRx.keys = app;
        b.safety = safety(b.ecdh.getPublicKey(), peer);
      });
    } else if (h.t === 'peer-joined' && h.role === 'alice' && b.ecdh) hello();
    else if (h.t === 'frame') {
      const hb = Buffer.from(m.headerBytes); const pl = Buffer.from(m.payload);
      chain = chain.then(async () => {
        if (h.sid !== b.sid) return;
        const mine = independentReceive(b.rx, hb, pl);
        const app = await receiveFrame(b.appRx, new Uint8Array(hb), new Uint8Array(pl));
        b.results.push({ seq: h.seq, mode: h.mode, mine, app, payload: pl, headerBytes: hb });
      });
    }
  });
  b.open = new Promise((r) => ws.once('open', r));
  b.close = () => ws.close();
  return b;
}

function eveTap(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=eve`);
  const e = { frames: [], plain: [] };
  ws.on('message', (data) => {
    const m = decodeMsg(Buffer.from(data));
    if (m.header.t === 'frame') e.frames.push(m);
    else if (m.header.t === 'eve-plain') e.plain.push(m);
  });
  e.open = new Promise((r) => ws.once('open', r));
  e.of = (sid) => e.frames.filter((f) => f.header.sid === sid);
  e.close = () => ws.close();
  return e;
}

// ---------------------------------------------------------------- harness
async function setup() {
  const app = await createCipherServer({ port: 0, portTries: 0, host: '127.0.0.1', quiet: true });
  const alice = simAlice(app.port);
  const bob = independentBob(app.port);
  const eve = eveTap(app.port);
  const stage = connect(app.port, 'stage');
  await Promise.all([alice.open, bob.open, eve.open, stage.open]);
  const env = { app, alice, bob, eve, stage, plain: new Map() };
  try { await waitFor(() => ready(env), 5000, 'first handshake'); } catch (e) { await teardown(env); throw e; }
  return env;
}
const ready = ({ alice, bob }) => alice.ready() && alice.state?.sid === alice.sid && bob.sid === alice.sid && !!bob.keys && !!bob.appRx?.keys;
async function switchTo(env, patch) {
  const old = env.alice.sid;
  env.stage.control({ ...patch, restart: true });
  await waitFor(() => env.alice.sid !== old && ready(env), 5000, 'new session + handshake');
}
// Alice sends frame `seq` = splash for seq < 10, then synthetic frame seq % 40. We remember the plaintext.
async function send(env, n, gap = 0) {
  for (let i = 0; i < n; i++) {
    const seq = env.alice.seq;
    const px = frames[seq % frames.length];
    env.plain.set(`${env.alice.sid}:${seq}`, Buffer.from(seq < SPLASH_FRAMES ? splash : px));
    await env.alice.sendFrame(px);
    if (gap) await sleep(gap);
  }
}
const plainOf = (env, seq) => env.plain.get(`${env.alice.sid}:${seq}`);
const agree = (r) => r.mine.ok === r.app.ok && (r.mine.ok || r.mine.kind === r.app.kind);
async function teardown(env) { env.alice.close(); env.bob.close(); env.eve.close(); env.stage.close(); await env.app.close(); }

// ---------------------------------------------------------------- the tests
test('independent: every mode on the wire is byte-identical to OpenSSL, and an OpenSSL Bob decrypts it exactly', async () => {
  const env = await setup();
  try {
    for (const mode of ['plain', 'ecb', 'cbc', 'ctr', 'ctr-reuse', 'ctr-hmac', 'gcm']) {
      await switchTo(env, { mode });
      await send(env, 16);
      await waitFor(() => env.bob.results.length >= 16 && env.eve.of(env.alice.sid).length >= 16, 4000, `${mode} frames`);
      // ECDH + HKDF agree: the app's Alice and the OpenSSL Bob compute the same safety number.
      assert.equal(env.alice.safety, env.bob.safety, `${mode}: safety numbers match`);
      assert.ok(env.bob.peerPub.equals(Buffer.from(env.alice.kp.pubRaw)), 'Bob got Alice\'s real public key');
      for (const f of env.eve.of(env.alice.sid)) {
        const expected = opensslEncrypt(env.bob.keys, f.header, f.headerBytes, tiles(plainOf(env, f.header.seq)));
        assert.ok(expected.equals(f.payload), `${mode} seq ${f.header.seq}: wire bytes = OpenSSL bytes`);
        if (mode === 'gcm') assert.ok(Buffer.from(f.header.iv, 'base64').equals(gcmNonce(env.bob.keys.nonceSalt, f.header.seq)), 'GCM nonce = salt ‖ seq');
      }
      for (const r of env.bob.results) {
        assert.ok(r.mine.ok && r.app.ok, `${mode} seq ${r.seq}: both receivers accept`);
        assert.ok(untiles(r.mine.tiles).equals(plainOf(env, r.seq)), `${mode} seq ${r.seq}: Bob sees Alice's exact picture`);
      }
    }
  } finally { await teardown(env); }
});

test('independent attack 1: ECB leaks the picture (equal tiles → equal blocks); CBC/CTR/GCM fix it', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'ecb' });
    await send(env, 20);
    await waitFor(() => env.eve.of(env.alice.sid).length >= 20, 4000, 'ecb frames');
    const live = env.eve.of(env.alice.sid).filter((f) => f.header.seq >= SPLASH_FRAMES);
    const ecbLeak = Math.min(...live.map((f) => dupPercent(f.payload)));
    assert.ok(ecbLeak > 50, `ECB: at least ${ecbLeak.toFixed(1)} % of blocks repeat`);
    // Pick two different tiles with identical plaintext: their ciphertext blocks are identical.
    const f = live[live.length - 1];
    const pt = tiles(plainOf(env, f.header.seq));
    const firstSeen = new Map(); let pair = null;
    for (let b = 0; b < 1200 && !pair; b++) { const k = pt.subarray(b * 16, b * 16 + 16).toString('hex'); if (firstSeen.has(k)) pair = [firstSeen.get(k), b]; else firstSeen.set(k, b); }
    assert.ok(pair, 'the picture has repeated tiles (flat wall)');
    const blk = (buf, i) => buf.subarray(i * 16, i * 16 + 16);
    assert.ok(blk(f.payload, pair[0]).equals(blk(f.payload, pair[1])), `ECB: tile ${pair[0]} and ${pair[1]} → same ciphertext block`);
    for (const mode of ['cbc', 'ctr', 'ctr-hmac', 'gcm']) {
      await switchTo(env, { mode });
      await send(env, 20);
      await waitFor(() => env.eve.of(env.alice.sid).length >= 20, 4000, `${mode} frames`);
      const worst = Math.max(...env.eve.of(env.alice.sid).map((x) => dupPercent(x.payload)));
      assert.ok(worst < 1, `${mode}: repeated blocks ${worst.toFixed(2)} % (should be ~0)`);
    }
  } finally { await teardown(env); }
});

test('independent attack 2: CTR nonce reuse → C1⊕C2 = P1⊕P2 and K = C0⊕splash decrypts the live call; fresh nonces fix it', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'ctr-reuse' });
    await send(env, 30);
    await waitFor(() => env.eve.of(env.alice.sid).length >= 30, 4000, 'ctr-reuse frames');
    const fs = env.eve.of(env.alice.sid);
    assert.equal(new Set(fs.map((f) => f.header.iv)).size, 1, 'the same IV in every frame (the bug)');
    const c0 = fs.find((f) => f.header.seq === 0).payload;
    // Eve knows the public splash card, so: K = C0 ⊕ splash.  (She never sees the key.)
    const K = xor(c0, tiles(splash));
    for (const f of fs.filter((x) => x.header.seq >= SPLASH_FRAMES)) {
      assert.ok(untiles(xor(f.payload, K)).equals(plainOf(env, f.header.seq)), `seq ${f.header.seq}: C ⊕ K = Alice's live picture, exactly`);
    }
    const [a, b] = [fs[12], fs[25]];
    assert.ok(xor(a.payload, b.payload).equals(xor(tiles(plainOf(env, a.header.seq)), tiles(plainOf(env, b.header.seq)))), 'C1 ⊕ C2 = P1 ⊕ P2');
    // Fix: AES-CTR with a fresh random nonce per frame.
    await switchTo(env, { mode: 'ctr' });
    await send(env, 30);
    await waitFor(() => env.eve.of(env.alice.sid).length >= 30, 4000, 'ctr frames');
    const gs = env.eve.of(env.alice.sid);
    assert.equal(new Set(gs.map((f) => f.header.iv)).size, gs.length, 'every frame has its own IV');
    const K2 = xor(gs.find((f) => f.header.seq === 0).payload, tiles(splash));
    for (const f of gs.filter((x) => x.header.seq >= SPLASH_FRAMES)) {
      const guess = xor(f.payload, K2), real = tiles(plainOf(env, f.header.seq));
      let same = 0; for (let i = 0; i < FRAME_BYTES; i++) if (guess[i] === real[i]) same++;
      assert.ok(same / FRAME_BYTES < 0.02, `seq ${f.header.seq}: Eve's guess matches only ${(100 * same / FRAME_BYTES).toFixed(2)} % (random)`);
    }
  } finally { await teardown(env); }
});

test('independent attack 3: bit-flip — CTR Bob gets P ⊕ mask; GCM and CTR+HMAC tags fail (tag untouched)', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'ctr', attacks: { bitflip: { on: true, stamp: 'star' } } });
    await send(env, 16);
    await waitFor(() => env.bob.results.length >= 16, 4000, 'ctr frames');
    let mask = null;
    for (const r of env.bob.results) {
      assert.ok(r.mine.ok && r.app.ok, `ctr seq ${r.seq}: Bob accepts the tampered frame`);
      const delta = xor(r.mine.tiles, tiles(plainOf(env, r.seq)));
      assert.ok([...delta].every((x) => x === 0 || x === 0xff), 'only whole bytes under the stamp are flipped');
      mask ||= delta;
      assert.ok(delta.equals(mask), 'the same stamp on every frame');
    }
    const flipped = [...mask].filter((x) => x === 0xff).length;
    assert.ok(flipped > 300 && flipped < 10000, `a stamp-shaped area of ${flipped} pixels is flipped, without the key`);
    for (const mode of ['gcm', 'ctr-hmac']) {
      await switchTo(env, { mode, attacks: { bitflip: { on: true, stamp: 'star' } } });
      await send(env, 8);
      await waitFor(() => env.bob.results.length >= 8, 4000, `${mode} frames`);
      const tagLen = mode === 'gcm' ? 16 : 32;
      for (const r of env.bob.results) {
        assert.equal(r.mine.kind, 'tamper', `${mode} seq ${r.seq}: OpenSSL tag check fails`);
        assert.ok(agree(r), `${mode} seq ${r.seq}: the app's receiver also says ${r.mine.kind} (got ${r.app.kind})`);
        const orig = env.eve.of(env.alice.sid).find((f) => f.header.seq === r.seq).payload;
        assert.ok(orig.subarray(orig.length - tagLen).equals(r.payload.subarray(r.payload.length - tagLen)), 'Eve never touched the tag');
        assert.ok(xor(orig.subarray(0, FRAME_BYTES), r.payload.subarray(0, FRAME_BYTES)).equals(mask), 'only the ciphertext was flipped, by the same mask');
      }
    }
  } finally { await teardown(env); }
});

async function recordAndLoop(env) {
  env.stage.control({ attacks: { replay: { phase: 'recording', seconds: 1 } } });
  await waitFor(() => env.stage.state?.attacks.replay.phase === 'recording', 2000, 'recording');
  const t0 = Date.now();
  while (env.stage.state.attacks.replay.phase === 'recording' && Date.now() - t0 < 4000) await send(env, 1, 40);
  assert.equal(env.stage.state.attacks.replay.phase, 'ready');
  await send(env, 5, 40);                                   // a few more live frames after the recording
  await waitFor(() => env.bob.results.length >= env.alice.seq, 3000, 'live frames');
  const newest = Math.max(...env.bob.results.map((r) => r.seq));
  const n0 = env.bob.results.length;
  env.stage.control({ attacks: { replay: { phase: 'looping' } } });
  const t1 = Date.now();
  while (Date.now() - t1 < 1600) await send(env, 1, 40);  // Alice keeps sending live video…
  const looped = env.bob.results.slice(n0);
  env.stage.control({ attacks: { replay: { phase: 'off' } } });
  return { looped, newest };
}

test('independent attack 4: replay — CTR Bob accepts old frames (sees the past); GCM/CTR+HMAC reject them by the counter, not the tag', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'ctr' });
    await send(env, 12);
    let { looped, newest } = await recordAndLoop(env);
    assert.ok(looped.length > 10, `Bob received ${looped.length} looped frames`);
    assert.ok(looped.every((r) => r.seq <= newest), '…but only OLD frames reach Bob (live video blocked)');
    for (const r of looped) {
      assert.ok(r.mine.ok && r.app.ok, `ctr: old frame seq ${r.seq} accepted`);
      assert.ok(untiles(r.mine.tiles).equals(plainOf(env, r.seq)), 'Bob is shown the past, exactly');
    }
    for (const mode of ['gcm', 'ctr-hmac']) {
      await switchTo(env, { mode });
      await send(env, 12);
      ({ looped, newest } = await recordAndLoop(env));
      assert.ok(looped.length > 10, `${mode}: Bob received ${looped.length} looped frames`);
      for (const r of looped) {
        assert.equal(r.mine.tagOk, true, `${mode} seq ${r.seq}: the replayed frame is authentic (tag valid)…`);
        assert.equal(r.mine.kind, 'replay', `${mode} seq ${r.seq}: …but its counter is old → rejected`);
        assert.ok(agree(r), `${mode} seq ${r.seq}: app receiver agrees (got ${r.app.kind})`);
      }
      // After Stop, live frames (newer seq) are accepted again.
      await waitFor(() => env.stage.state.attacks.replay.phase === 'ready', 2000, 'stopped');
      await sleep(150);                                      // let looped frames still in flight arrive
      const first = env.alice.seq;
      await send(env, 6);
      await waitFor(() => env.bob.results.filter((r) => r.seq >= first).length >= 6, 3000, 'live again');
      assert.ok(env.bob.results.filter((r) => r.seq >= first).every((r) => r.mine.ok && r.app.ok), `${mode}: live again after Stop`);
    }
  } finally { await teardown(env); }
});

test('independent attack 5: MITM — even GCM is decrypted by Eve and accepted by Bob; only the safety numbers differ', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'gcm', attacks: { mitm: { on: true } } });
    assert.equal(env.stage.state.mitmActive, true);
    await send(env, 16);
    await waitFor(() => env.bob.results.length >= 16 && env.eve.plain.filter((m) => m.header.sid === env.alice.sid).length >= 16, 4000, 'mitm frames');
    // Bob (OpenSSL AES-GCM) accepts every frame and sees Alice's real picture…
    for (const r of env.bob.results) {
      assert.ok(r.mine.ok && r.app.ok, `seq ${r.seq}: tag valid, accepted`);
      assert.ok(untiles(r.mine.tiles).equals(plainOf(env, r.seq)), 'Bob sees Alice\'s real picture');
    }
    // …but the keys were swapped: neither side has the other's real public key.
    assert.ok(!env.bob.peerPub.equals(Buffer.from(env.alice.kp.pubRaw)), 'Bob got Eve\'s key, not Alice\'s');
    assert.ok(!Buffer.from(env.alice.peerPub).equals(env.bob.ecdh.getPublicKey()), 'Alice got Eve\'s key, not Bob\'s');
    // Eve decrypted every frame (she holds k_AE): her plaintext = Alice's picture.
    for (const m of env.eve.plain.filter((x) => x.header.sid === env.alice.sid)) {
      assert.ok(Buffer.from(m.payload).equals(plainOf(env, m.header.seq)), `Eve reads frame ${m.header.seq}`);
    }
    // The only clue: the safety numbers differ. Each is (re)computed independently here.
    const aliceNumber = safety(Buffer.from(env.alice.kp.pubRaw), Buffer.from(env.alice.peerPub));
    assert.equal(env.alice.safety, aliceNumber, 'the app computes the safety number exactly as specified');
    assert.notEqual(aliceNumber, env.bob.safety, `MISMATCH: Alice ${aliceNumber} vs Bob ${env.bob.safety}`);

    // Fix (step 8): no MITM → same keys on both ends, the numbers match, Eve has no plaintext.
    await switchTo(env, { mode: 'gcm', attacks: { mitm: { on: false } } });
    assert.equal(env.stage.state.mitmActive, false);
    await send(env, 16);
    await waitFor(() => env.bob.results.length >= 16, 4000, 'gcm frames');
    assert.equal(env.alice.safety, env.bob.safety, 'MATCH');
    assert.ok(env.bob.peerPub.equals(Buffer.from(env.alice.kp.pubRaw)));
    assert.equal(env.eve.plain.filter((m) => m.header.sid === env.alice.sid).length, 0, 'Eve decrypts nothing');
    assert.ok(env.bob.results.every((r) => r.mine.ok && r.app.ok));
  } finally { await teardown(env); }
});
