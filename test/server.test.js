// test/server.test.js — integration: the real relay server + Node Alice/Bob/Eve clients.
// Every attack is switched on through `control` messages, exactly like the Stage does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesEqual } from './helpers.js';
import { createCipherServer, sanitizePatch } from '../server/app.js';
import { simAlice, simBob, connect, waitFor } from './sim-clients.js';
import { syntheticFrames, xorBytes, fromTiles, makeSplashFrame, toTiles } from '../shared/frame.js';
import { makeStampMask } from '../shared/stamps.js';
import { stepPatch, STEPS } from '../shared/steps.js';

const frames = syntheticFrames(40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const app = await createCipherServer({ port: 0, portTries: 0, host: '127.0.0.1', quiet: true });
  const alice = simAlice(app.port);
  const bob = simBob(app.port);
  const stage = connect(app.port, 'stage');
  await Promise.all([alice.open, bob.open, stage.open]);
  return { app, alice, bob, stage };
}
async function ready(alice, bob) {
  await waitFor(() => alice.ready() && bob.keys && alice.sid === bob.sid && bob.rx?.keys && alice.state && alice.sid === alice.state.sid, 5000, 'handshake');
}
async function switchTo(env, patch) {
  const oldSid = env.alice.sid;
  env.stage.control({ ...patch, restart: true });
  await waitFor(() => env.alice.sid !== oldSid && env.alice.state.sid === env.alice.sid, 3000, 'new session');
  await ready(env.alice, env.bob);
}
// Frame number `seq` always carries frames[seq % 40] (the first 10 are the splash card).
async function sendN(alice, n, gapMs = 0) {
  const sent = [];
  for (let i = 0; i < n; i++) { sent.push(await alice.sendFrame(frames[alice.seq % frames.length])); if (gapMs) await sleep(gapMs); }
  return sent;
}
async function teardown({ app, alice, bob, stage }) {
  alice.close(); bob.close(); stage.close();
  await app.close();
}

test('sanitizePatch keeps only valid keys', () => {
  assert.deepEqual(sanitizePatch({ mode: 'gcm', levels: 99, evil: 1, attacks: { mitm: { on: 'yes' }, bitflip: { on: true, stamp: 'nope' } } }), { mode: 'gcm', attacks: { bitflip: { on: true } } });
  assert.equal(sanitizePatch({ step: 8 }).step, 8);
  assert.equal(sanitizePatch({ step: STEPS.length }).step, undefined);
});

test('integration: handshake, frames flow, every mode works through the relay', async () => {
  const env = await setup();
  try {
    await ready(env.alice, env.bob);
    assert.equal(env.alice.safety, env.bob.safety, 'safety numbers match without MITM');
    for (const mode of ['plain', 'ecb', 'cbc', 'ctr', 'ctr-reuse', 'ctr-hmac', 'gcm']) {
      await switchTo(env, { mode });
      await sendN(env.alice, 14);
      await waitFor(() => env.bob.results.length >= 14, 3000, `${mode} frames`);
      assert.ok(env.bob.results.every((r) => r.ok), `${mode}: ${env.bob.results.find((r) => !r.ok)?.reason}`);
      assert.ok(bytesEqual(env.bob.results[0].pixels, makeSplashFrame()), `${mode}: first frame is the splash`);
      assert.ok(bytesEqual(env.bob.results[13].pixels, frames[13]), `${mode}: live frame`);
    }
  } finally { await teardown(env); }
});

test('integration: bit-flip — CTR shows the stamp, GCM and CTR+HMAC reject it', async () => {
  const env = await setup();
  try {
    await switchTo(env, { mode: 'ctr', attacks: { bitflip: { on: true, stamp: 'star' } } });
    await sendN(env.alice, 12);
    await waitFor(() => env.bob.results.length >= 12, 3000, 'ctr frames');
    const mask = fromTiles(makeStampMask('star'));
    assert.ok(env.bob.results.every((r) => r.ok));
    assert.ok(bytesEqual(env.bob.results[11].pixels, xorBytes(frames[11], mask)), 'Bob sees original ⊕ star');
    for (const mode of ['gcm', 'ctr-hmac']) {
      await switchTo(env, { mode, attacks: { bitflip: { on: true, stamp: 'star' } } });
      await sendN(env.alice, 5);
      await waitFor(() => env.bob.results.length >= 5, 3000, `${mode} frames`);
      assert.ok(env.bob.results.every((r) => !r.ok && r.kind === 'tamper'), `${mode} rejects`);
    }
  } finally { await teardown(env); }
});

test('integration: replay — CTR accepts the CCTV loop, GCM and CTR+HMAC reject it', async () => {
  const env = await setup();
  try {
    for (const mode of ['ctr', 'gcm', 'ctr-hmac']) {
      await switchTo(env, { mode });
      await sendN(env.alice, 10);                                    // splash
      env.stage.control({ attacks: { replay: { phase: 'recording', seconds: 1 } } });
      await waitFor(() => env.alice.state.attacks.replay.phase === 'recording', 2000, 'recording');
      await sendN(env.alice, 14, 100);                               // ~1.4 s of live video
      await waitFor(() => env.alice.state.attacks.replay.phase === 'ready', 2000, 'recorded');
      const before = env.bob.results.length;
      env.stage.control({ attacks: { replay: { phase: 'looping' } } });
      await waitFor(() => env.alice.state.attacks.replay.phase === 'looping', 2000, 'looping');
      await sendN(env.alice, 5, 100);                                // live frames are blocked now
      await sleep(400);
      const looped = env.bob.results.slice(before);
      assert.ok(looped.length >= 8, `${mode}: looped frames reached Bob (${looped.length})`);
      if (mode === 'ctr') {
        assert.ok(looped.every((r) => r.ok), 'ctr accepts the replay');
        assert.ok(looped.every((r) => r.header.seq < 24), 'Bob only sees old frames');
      } else {
        assert.ok(looped.every((r) => !r.ok && r.kind === 'replay'), `${mode} rejects replays`);
      }
      env.stage.control({ attacks: { replay: { phase: 'off' } } });
      await waitFor(() => env.alice.state.attacks.replay.phase !== 'looping', 2000, 'stop');
      const n = env.bob.results.length;
      await sendN(env.alice, 3);
      await waitFor(() => env.bob.results.length >= n + 3, 2000, 'live again');
      assert.ok(env.bob.results.slice(n).every((r) => r.ok), `${mode}: live video resumes`);
    }
  } finally { await teardown(env); }
});

test('integration: MITM — Bob accepts, Eve sees plaintext, safety numbers mismatch; off → match', async () => {
  const env = await setup();
  const eve = connect(env.app.port, 'eve');
  await eve.open;
  try {
    await switchTo(env, { mode: 'gcm', attacks: { mitm: { on: true } } });
    assert.equal(env.alice.state.mitmActive, true);
    assert.notEqual(env.alice.safety, env.bob.safety, 'safety numbers expose Eve');
    eve.messages.length = 0;
    await sendN(env.alice, 13);
    await waitFor(() => env.bob.results.length >= 13, 3000, 'mitm frames');
    assert.ok(env.bob.results.every((r) => r.ok), `Bob accepts: ${env.bob.results.find((r) => !r.ok)?.reason}`);
    assert.ok(bytesEqual(env.bob.results[12].pixels, frames[12]));
    const plain = eve.messages.filter((m) => m.header.t === 'eve-plain');
    assert.ok(plain.length >= 13, 'Eve got the plaintext');
    assert.ok(bytesEqual(plain.find((m) => m.header.seq === 12).payload, frames[12]), 'Eve plaintext = Alice plaintext');
    await switchTo(env, { mode: 'gcm', attacks: { mitm: { on: false } } });
    assert.equal(env.alice.state.mitmActive, false);
    assert.equal(env.alice.safety, env.bob.safety, 'safety numbers match again');
  } finally { eve.close(); await teardown(env); }
});

test('integration: Eve and watchers get frame copies; watchers are throttled; seq 0 always delivered', async () => {
  const env = await setup();
  const eve = connect(env.app.port, 'eve');
  const watch = connect(env.app.port, 'watch');
  await Promise.all([eve.open, watch.open]);
  try {
    await switchTo(env, { mode: 'ctr-reuse', watchFps: 2 });
    eve.messages.length = 0; watch.messages.length = 0;
    await sendN(env.alice, 20, 20);
    await waitFor(() => eve.messages.filter((m) => m.header.t === 'frame').length >= 20, 3000, 'eve frames');
    const wf = watch.messages.filter((m) => m.header.t === 'frame');
    assert.ok(wf.some((m) => m.header.seq === 0), 'watcher got the splash frame');
    assert.ok(wf.length <= 4, `watcher throttled (${wf.length})`);
    // Eve's keystream recovery works on what the relay copied to her.
    const ef = eve.messages.filter((m) => m.header.t === 'frame');
    const c0 = ef.find((m) => m.header.seq === 0), c19 = ef.find((m) => m.header.seq === 19);
    const K = xorBytes(c0.payload, toTiles(makeSplashFrame()));
    assert.ok(bytesEqual(fromTiles(xorBytes(c19.payload, K)), frames[19]), 'keystream recovery works over the network');
  } finally { eve.close(); watch.close(); await teardown(env); }
});

test('integration: control from a non-localhost client is refused', async () => {
  const env = await setup();
  try {
    await ready(env.alice, env.bob);
    const remoteStage = connect(env.app.port, 'stage', { 'x-ciphercam-simulate-remote': '1' });
    await remoteStage.open;
    await waitFor(() => remoteStage.closed, 2000, 'remote stage closed');
    assert.equal(remoteStage.closed.code, 4003);
    const phone = connect(env.app.port, 'watch', { 'x-ciphercam-simulate-remote': '1' });
    await phone.open;
    await waitFor(() => phone.state, 2000, 'phone state');
    const mode = env.app.state.mode;
    phone.control({ mode: mode === 'gcm' ? 'ecb' : 'gcm', attacks: { mitm: { on: true } } });
    phone.send({ t: 'restart' });
    await waitFor(() => phone.messages.some((m) => m.header.t === 'error' && m.header.code === 'forbidden'), 2000, 'forbidden');
    await sleep(100);
    assert.equal(env.app.state.mode, mode);
    assert.equal(env.app.state.attacks.mitm.on, false);
    phone.close();
  } finally { await teardown(env); }
});

test('integration: a second Alice replaces the first cleanly; reconnect restarts the session', async () => {
  const env = await setup();
  try {
    await ready(env.alice, env.bob);
    const sid = env.app.state.sid;
    const alice2 = simAlice(env.app.port);
    await alice2.open;
    await waitFor(() => env.alice.closed, 2000, 'old alice closed');
    assert.equal(env.alice.closed.code, 4000);
    await waitFor(() => alice2.ready() && env.bob.rx?.keys && alice2.sid === env.bob.sid, 3000, 're-handshake');
    assert.notEqual(env.app.state.sid, sid);
    await sendN(alice2, 11);
    await waitFor(() => env.bob.results.length >= 11, 3000, 'frames from new alice');
    assert.ok(env.bob.results.every((r) => r.ok));
    alice2.close();
  } finally { await teardown(env); }
});

test('integration: every demo step patch is accepted and resets attacks', async () => {
  const env = await setup();
  try {
    await ready(env.alice, env.bob);
    for (let n = 0; n < STEPS.length; n++) {
      env.stage.control(stepPatch(n));
      await waitFor(() => env.app.state.step === n, 2000, `step ${n}`);
      const s = env.app.state;
      const want = { ...{ mitm: false, bitflip: false }, ...(STEPS[n].config.attacks?.mitm ? { mitm: STEPS[n].config.attacks.mitm.on } : {}), ...(STEPS[n].config.attacks?.bitflip ? { bitflip: STEPS[n].config.attacks.bitflip.on } : {}) };
      assert.equal(s.mode, STEPS[n].config.mode);
      assert.equal(s.attacks.bitflip.on, want.bitflip, `step ${n} bitflip`);
      assert.equal(s.attacks.mitm.on, want.mitm, `step ${n} mitm`);
      assert.equal(s.attacks.replay.phase, 'off');
      assert.equal(s.away, false);
    }
  } finally { await teardown(env); }
});
