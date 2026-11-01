// test/attacks.test.js — every attack does what the demo claims, and every fix stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesEqual } from './helpers.js';
import { generateKeyPair, deriveSessionKeys, safetyNumber } from '../shared/crypto.js';
import { createSenderSession, buildFrame } from '../shared/sender.js';
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { syntheticFrames, makeSplashFrame, toTiles, fromTiles, xorBytes, leakPercent, FRAME_BYTES } from '../shared/frame.js';
import { makeStampMask } from '../shared/stamps.js';
import { applyBitflip, createReplay, createMitm } from '../server/eve-active.js';

async function pair(sid = 'sid-test') {
  const a = await generateKeyPair(), b = await generateKeyPair();
  return {
    sid, a, b,
    ka: await deriveSessionKeys(a.privateKey, b.pubRaw, sid),
    kb: await deriveSessionKeys(b.privateKey, a.pubRaw, sid),
  };
}
const frames = syntheticFrames(30);

test('Attack 1 — ECB leaks: leak meter > 50 % for ECB, ≈ 0 % for CBC, CTR, GCM', async () => {
  const p = await pair();
  const leak = {};
  for (const mode of ['ecb', 'cbc', 'ctr', 'ctr-hmac', 'gcm']) {
    const tx = createSenderSession({ sid: p.sid, mode, keys: p.ka });
    const f = await buildFrame(tx, frames[29], 12);
    leak[mode] = leakPercent(f.payload);
  }
  assert.ok(leak.ecb > 50, `ecb leak ${leak.ecb}`);
  for (const m of ['cbc', 'ctr', 'ctr-hmac', 'gcm']) assert.ok(leak[m] < 1, `${m} leak ${leak[m]}`);
});

test('Attack 2 — CTR nonce reuse: C1 ⊕ C2 = P1 ⊕ P2, and the known splash frame reveals the keystream', async () => {
  const p = await pair();
  const tx = createSenderSession({ sid: p.sid, mode: 'ctr-reuse', keys: p.ka });
  const splash = makeSplashFrame();
  const f0 = await buildFrame(tx, splash, 0);                 // the public "Connecting…" card
  const f1 = await buildFrame(tx, frames[20], 15);
  const f2 = await buildFrame(tx, frames[29], 16);
  assert.equal(f0.header.iv, f1.header.iv);                   // the bug: same IV
  const P1 = toTiles(frames[20]), P2 = toTiles(frames[29]);
  assert.ok(bytesEqual(xorBytes(f1.payload, f2.payload), xorBytes(P1, P2)));
  // Eve: K = C0 ⊕ splash, then live frame = C ⊕ K. Exactly, byte for byte.
  const K = xorBytes(f0.payload, toTiles(splash));
  assert.ok(bytesEqual(fromTiles(xorBytes(f2.payload, K)), frames[29]));
  // With a fresh nonce per frame ("ctr") the same trick gives garbage.
  const good = createSenderSession({ sid: p.sid, mode: 'ctr', keys: p.ka });
  const g0 = await buildFrame(good, splash, 0), g2 = await buildFrame(good, frames[29], 16);
  assert.notEqual(g0.header.iv, g2.header.iv);
  const wrong = fromTiles(xorBytes(g2.payload, xorBytes(g0.payload, toTiles(splash))));
  let same = 0; for (let i = 0; i < FRAME_BYTES; i++) if (wrong[i] === frames[29][i]) same++;
  assert.ok(same < FRAME_BYTES * 0.05, `random match ${same}`);
});

test('Attack 3 — bit-flip in CTR: Bob gets original ⊕ mask (the star appears)', async () => {
  const p = await pair();
  const mask = makeStampMask('star');
  const tx = createSenderSession({ sid: p.sid, mode: 'ctr', keys: p.ka });
  const rx = createReceiverState({ sid: p.sid, keys: p.kb });
  const f = await buildFrame(tx, frames[29], 3);
  const r = await receiveFrame(rx, f.headerBytes, applyBitflip('ctr', f.payload, mask));
  assert.ok(r.ok);
  assert.ok(bytesEqual(r.pixels, xorBytes(frames[29], fromTiles(mask))));
});

test('Fix 3 — bit-flip in GCM and CTR+HMAC is rejected (tag mismatch)', async () => {
  const p = await pair();
  const mask = makeStampMask('hacked');
  for (const mode of ['gcm', 'ctr-hmac']) {
    const tx = createSenderSession({ sid: p.sid, mode, keys: p.ka });
    const rx = createReceiverState({ sid: p.sid, keys: p.kb });
    const f = await buildFrame(tx, frames[29], 3);
    const r = await receiveFrame(rx, f.headerBytes, applyBitflip(mode, f.payload, mask));
    assert.equal(r.ok, false);
    assert.equal(r.kind, 'tamper', mode);
    assert.match(r.reason, /TAMPERED FRAME REJECTED/);
    // Changing the header (e.g. seq) is also caught, because the header is authenticated.
    const h = JSON.parse(new TextDecoder().decode(f.headerBytes)); h.seq = 999;
    const r2 = await receiveFrame(rx, new TextEncoder().encode(JSON.stringify(h)), f.payload);
    assert.equal(r2.kind, 'tamper', `${mode} header`);
  }
});

test('bit-flip in CBC and ECB: no integrity — Bob accepts a damaged frame', async () => {
  const p = await pair();
  const mask = makeStampMask('star');
  for (const mode of ['cbc', 'ecb']) {
    const tx = createSenderSession({ sid: p.sid, mode, keys: p.ka });
    const rx = createReceiverState({ sid: p.sid, keys: p.kb });
    const f = await buildFrame(tx, frames[29], 3);
    const r = await receiveFrame(rx, f.headerBytes, applyBitflip(mode, f.payload, mask));
    assert.ok(r.ok, `${mode}: ${r.reason}`);
    assert.ok(!bytesEqual(r.pixels, frames[29]));
  }
});

test('Attack 4 — replay in CTR is accepted; Fix 4 — GCM and CTR+HMAC reject it', async () => {
  const p = await pair();
  for (const mode of ['ctr', 'gcm', 'ctr-hmac']) {
    const tx = createSenderSession({ sid: p.sid, mode, keys: p.ka });
    const rx = createReceiverState({ sid: p.sid, keys: p.kb });
    const rec = createReplay();
    rec.start(1, 0);
    const sent = [];
    for (let seq = 0; seq < 20; seq++) {
      const f = await buildFrame(tx, frames[seq], seq);
      if (seq < 10) rec.add(f.headerBytes, f.payload, seq * 100);
      sent.push(f);
      assert.ok((await receiveFrame(rx, f.headerBytes, f.payload)).ok);
    }
    // Eve now loops the recording (seq 0..9) to Bob.
    const results = [];
    for (const old of rec.frames) results.push(await receiveFrame(rx, old.headerBytes, old.payload));
    if (mode === 'ctr') {
      assert.ok(results.every((r) => r.ok), 'ctr accepts replays');
      assert.ok(bytesEqual(results[5].pixels, frames[5]), 'Bob sees the past');
    } else {
      assert.ok(results.every((r) => !r.ok && r.kind === 'replay'), `${mode} rejects replays`);
      assert.match(results[0].reason, /REPLAY REJECTED \(seq 0 ≤ last 19\)/);
      // Live video continues afterwards.
      const live = await buildFrame(tx, frames[25], 20);
      assert.ok((await receiveFrame(rx, live.headerBytes, live.payload)).ok);
    }
  }
});

test('Attack 5 — MITM: Bob decrypts fine (even GCM), Eve sees Alice\'s plaintext, safety numbers mismatch', async () => {
  const sid = 'mitm-session';
  const alice = await generateKeyPair(), bob = await generateKeyPair();
  const eve = await createMitm(sid);
  // The relay swaps the keys inside the hello messages.
  const bobSeesPub = await eve.onHello('alice', alice.pubRaw);
  const aliceSeesPub = await eve.onHello('bob', bob.pubRaw);
  const ka = await deriveSessionKeys(alice.privateKey, aliceSeesPub, sid);
  const kb = await deriveSessionKeys(bob.privateKey, bobSeesPub, sid);
  for (const mode of ['gcm', 'ctr-hmac', 'ctr']) {
    const tx = createSenderSession({ sid, mode, keys: ka });
    const rx = createReceiverState({ sid, keys: kb });
    for (let seq = 0; seq < 3; seq++) {
      const f = await buildFrame(tx, frames[seq + 10], seq);
      // Without Eve, Bob cannot decrypt Alice's frames: the keys differ.
      if (mode === 'gcm' && seq === 0) {
        const direct = await receiveFrame(createReceiverState({ sid, keys: kb }), f.headerBytes, f.payload);
        assert.equal(direct.ok, false);
      }
      const t = await eve.transform(f.headerBytes, f.payload);
      assert.ok(!t.error, t.error);
      assert.ok(bytesEqual(t.pixels, frames[seq + 10]), 'Eve sees Alice\'s plaintext');
      const r = await receiveFrame(rx, t.forward.headerBytes, t.forward.payload);
      assert.ok(r.ok, `${mode}: Bob accepts — ${r.reason}`);
      assert.ok(bytesEqual(r.pixels, frames[seq + 10]));
    }
  }
  const aliceNum = await safetyNumber(alice.pubRaw, aliceSeesPub);
  const bobNum = await safetyNumber(bobSeesPub, bob.pubRaw);
  assert.notEqual(aliceNum, bobNum, 'safety numbers expose Eve');
  const sn = await eve.safetyNumbers();
  assert.equal(sn.alice, aliceNum); assert.equal(sn.bob, bobNum);
  // Without MITM they match.
  assert.equal(await safetyNumber(alice.pubRaw, bob.pubRaw), await safetyNumber(bob.pubRaw, alice.pubRaw));
});
