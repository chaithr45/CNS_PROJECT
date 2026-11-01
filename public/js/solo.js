// public/js/solo.js — "Solo mode": the whole CipherCam demo in ONE page, no server.
// Alice, an in-memory relay with Eve's active attacks, Eve's passive views and Bob all
// run here, using exactly the same shared modules as the classroom version
// (shared/sender.js, shared/receiver.js, server/eve-active.js, public/js/eve-view.js).
// Built into a static site with `npm run build:solo` (deployable to GitHub Pages / Vercel).
import { $, initPage, setupAesJs, createScreen, toast } from '/js/common.js';
import { createEveView, EVE_SCREEN_HTML } from '/js/eve-view.js';
import { STEPS, stepPatch } from '/shared/steps.js';
import { MODES, generateKeyPair, deriveSessionKeys, safetyNumber, randomBytes, toHex } from '/shared/crypto.js';
import { createPipeline, createSyntheticScene, downscaleToLuma, makeSplashFrame, SPLASH_FRAMES } from '/shared/frame.js';
import { createSenderSession, buildFrame } from '/shared/sender.js';
import { createReceiverState, receiveFrame } from '/shared/receiver.js';
import { STAMPS, makeStampMask } from '/shared/stamps.js';
import { applyBitflip, createReplay, createMitm } from '/server/eve-active.js';

const ok = initPage({ needsCrypto: true });
await setupAesJs();

// ---------------------------------------------------------------- state (like the server's)
const state = {
  sid: null, mode: 'ctr', levels: 4, fps: 10, margin: 6, away: false, wave: false,
  eveView: 'raw', leakHighlight: false, overlay: null, step: 1, mitmActive: false,
  attacks: { bitflip: { on: false, stamp: 'star' }, replay: { phase: 'off', seconds: 5, recorded: 0 }, mitm: { on: false } },
};
let sess = null;              // current session: { sid, gen, tx, rx, seq, mitm, safety: {alice, bob} }
let gen = 0;
const replay = createReplay();
let loopTimer = null;
const masks = {};
const counts = { accepted: 0, tamper: 0, replay: 0, decrypt: 0 };
let lastOkAt = 0, lastBadAt = 0, lastBad = null, bobFps = 0, bobFrames = 0, mode = null;
const events = [];

const aliceScreen = createScreen($('#cAlice'));
const bobScreen = createScreen($('#cBob'));
$('#eveScreen').innerHTML = EVE_SCREEN_HTML;
const eve = createEveView({ canvas: $('#eveScreen canvas'), root: document });
const pipeline = createPipeline();
const scene = createSyntheticScene();
const splash = makeSplashFrame();
let video = null, grab = null;

function log(text, level = 'info') {
  events.push({ text, level, ts: Date.now() });
  if (events.length > 8) events.shift();
  $('#log').innerHTML = '';
  for (const e of events) {
    const li = document.createElement('li');
    li.className = e.level;
    li.innerHTML = `<span class="t">${new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>`;
    li.appendChild(document.createTextNode(e.text));
    $('#log').appendChild(li);
  }
}

// ---------------------------------------------------------------- sessions + handshake (in memory)
async function restart() {
  const my = ++gen;
  clearTimeout(loopTimer);
  replay.clear();
  state.attacks.replay.phase = 'off';
  const sid = toHex(randomBytes(4));
  state.sid = sid;
  state.mitmActive = state.attacks.mitm.on;
  // New session: Bob forgets the old picture, counters AND the last alert (otherwise a
  // "REPLAY REJECTED" from step 6 stayed on screen for 1.5 s into the next step).
  for (const k in counts) counts[k] = 0;
  lastOkAt = 0; lastBadAt = 0; lastBad = null; mode = null;
  $('#bobBar').classList.add('hidden');
  bobScreen.clear(0);
  refreshBob();
  sess = { sid, gen: my, tx: null, rx: createReceiverState({ sid }), seq: 0, mitm: null, safety: { alice: null, bob: null } };
  const s = sess;
  log(`New session ${sid} · ${MODES[state.mode].label}${state.mitmActive ? ' · MITM' : ''}`, state.mitmActive ? 'bad' : 'info');
  // Both sides make fresh ECDH key pairs and "send" their public keys through the relay.
  const [a, b] = await Promise.all([generateKeyPair(), generateKeyPair()]);
  let toBob = a.pubRaw, toAlice = b.pubRaw;
  if (state.mitmActive) {
    s.mitm = await createMitm(sid);
    toBob = await s.mitm.onHello('alice', a.pubRaw);   // Eve swaps Alice's key
    toAlice = await s.mitm.onHello('bob', b.pubRaw);   // ... and Bob's
    log('Eve swapped both public keys', 'bad');
  }
  const ka = await deriveSessionKeys(a.privateKey, toAlice, sid);
  const kb = await deriveSessionKeys(b.privateKey, toBob, sid);
  s.safety.alice = await safetyNumber(a.pubRaw, toAlice);
  s.safety.bob = await safetyNumber(toBob, b.pubRaw);
  if (my !== gen) return;
  s.rx.keys = kb;
  s.tx = createSenderSession({ sid, mode: state.mode, keys: ka, levels: state.levels });
  render();
}

// ---------------------------------------------------------------- control patches (like server applyPatch)
function applyPatch(p) {
  let again = !!p.restart;
  if (p.mode && p.mode !== state.mode) { state.mode = p.mode; again = true; }
  for (const k of ['eveView', 'leakHighlight', 'away', 'wave', 'overlay', 'step']) if (k in p) state[k] = p[k];
  const a = p.attacks || {};
  if (a.bitflip) {
    const was = state.attacks.bitflip.on;
    Object.assign(state.attacks.bitflip, a.bitflip);
    if (was !== state.attacks.bitflip.on) log(state.attacks.bitflip.on ? `Eve bit-flips: ${STAMPS[state.attacks.bitflip.stamp]}` : 'Eve stopped bit-flipping', state.attacks.bitflip.on ? 'bad' : 'info');
  }
  if (a.mitm && a.mitm.on !== state.attacks.mitm.on) { state.attacks.mitm.on = a.mitm.on; again = true; }
  if (again) restart();
  if (a.replay) {
    const r = state.attacks.replay;
    if (a.replay.seconds) r.seconds = a.replay.seconds;
    if (a.replay.phase === 'recording') { clearTimeout(loopTimer); replay.start(r.seconds); r.phase = 'recording'; log(`Eve records ${r.seconds} s of frames`, 'bad'); }
    else if (a.replay.phase === 'looping' && replay.frames.length) { r.phase = 'looping'; startLoop(); log(`Eve loops ${(replay.duration / 1000).toFixed(1)} s of old frames`, 'bad'); }
    else if (a.replay.phase === 'off' && r.phase !== 'off') { clearTimeout(loopTimer); r.phase = replay.frames.length ? 'ready' : 'off'; }
  }
  eve.setState(state);
  render();
}

function startLoop() {
  clearTimeout(loopTimer);
  const frames = replay.frames;
  let i = 0, t0 = performance.now();
  const tick = () => {
    if (state.attacks.replay.phase !== 'looping') return;
    toBob(frames[i].headerBytes, frames[i].payload);
    i++;
    if (i >= frames.length) { i = 0; t0 = performance.now() + 100; }
    loopTimer = setTimeout(tick, Math.max(0, t0 + frames[i].t - performance.now()));
  };
  tick();
}

// ---------------------------------------------------------------- the relay ("the network") + Eve
let chain = Promise.resolve();
async function relay(f) {
  const s = sess;
  eve.handle({ header: f.header, payload: f.payload });              // passive copy for Eve
  let fwd = { headerBytes: f.headerBytes, payload: f.payload };
  if (s.mitm) {
    const t = await s.mitm.transform(f.headerBytes, f.payload);       // decrypt with k_AE, re-encrypt with k_EB
    if (t.error) return;
    eve.handle({ header: { t: 'eve-plain', sid: s.sid, seq: f.header.seq }, payload: t.pixels });
    fwd = t.forward;
  }
  const r = state.attacks.replay;
  if (r.phase === 'recording' && replay.add(fwd.headerBytes, fwd.payload)) { r.phase = 'ready'; log(`Eve recorded ${replay.frames.length} frames`, 'bad'); }
  if (r.phase === 'looping') return;                                  // live video blocked
  toBob(fwd.headerBytes, fwd.payload);
}

function toBob(headerBytes, payload) {
  let p = payload;
  if (state.attacks.bitflip.on) {
    const m = JSON.parse(new TextDecoder().decode(headerBytes)).mode;
    p = applyBitflip(m, payload, masks[state.attacks.bitflip.stamp] ||= makeStampMask(state.attacks.bitflip.stamp));
  }
  const s = sess;
  chain = chain.then(() => bobReceive(s, headerBytes, p)).catch((e) => console.error(e));
}

// ---------------------------------------------------------------- Bob
async function bobReceive(s, headerBytes, payload) {
  if (s !== sess) return;
  const r = await receiveFrame(s.rx, headerBytes, payload);
  if (s !== sess) return;               // a new session started while this frame was being checked
  if (r.header?.mode) {
    mode = r.header.mode;
    $('#integ').className = `badge ${MODES[mode].integrity ? 'ok' : 'warn'}`;
    $('#integ').textContent = MODES[mode].integrity ? '🛡 Integrity: ON' : '⚠ Integrity: OFF';
  }
  if (r.ok) { bobScreen.gray(r.pixels); counts.accepted++; bobFrames++; lastOkAt = Date.now(); return; }
  if (['tamper', 'replay', 'decrypt'].includes(r.kind)) {
    counts[r.kind]++; lastBadAt = Date.now(); lastBad = r.reason;
    $('#bobBar').textContent = `⛔ ${r.reason}`;
    $('#bobBar').classList.remove('hidden');
  }
}

// ---------------------------------------------------------------- Alice's frame loop
let busy = false;
async function tick() {
  const t = performance.now();
  try {
    let luma;
    if (video && video.readyState >= 2) {
      const g = grab.getContext('2d', { willReadFrequently: true });
      g.drawImage(video, 0, 0, 640, 480);
      luma = downscaleToLuma(g.getImageData(0, 0, 640, 480).data, 640, 480);
    } else luma = scene.render(t, { away: state.away, wave: state.wave });
    const px = pipeline.process(luma, { levels: state.levels, margin: state.margin });
    const s = sess;
    const out = s?.tx && s.seq < SPLASH_FRAMES ? splash : px;
    aliceScreen.gray(out);
    if (s?.tx && !busy) {
      busy = true;
      try {
        const f = await buildFrame(s.tx, out, s.seq);
        if (s === sess) { s.seq++; $('#seqBadge').textContent = `seq ${s.seq}`; await relay(f); }
      } finally { busy = false; }
    }
  } catch (e) { console.error(e); }
  setTimeout(tick, Math.max(0, 100 - (performance.now() - t)));
}

// ---------------------------------------------------------------- steps, keys, auto-play
let timers = [], autoplay = false, autoTimer = null;
function goStep(n) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));
  for (const t of timers) clearTimeout(t);
  timers = [];
  applyPatch(stepPatch(n));
  runActions(STEPS[n].actions);
}
function runActions(actions) {
  for (const a of actions || []) timers.push(setTimeout(() => applyPatch({ ...(a.patch || {}), ...('overlay' in a ? { overlay: a.overlay } : {}) }), a.at));
}
function startAuto() {
  autoplay = true;
  let n = 0;
  const next = () => { if (!autoplay || n >= STEPS.length) { stopAuto(); return; } goStep(n); autoTimer = setTimeout(next, STEPS[n++].duration); };
  next();
}
function stopAuto() { autoplay = false; clearTimeout(autoTimer); render(); }

for (const s of STEPS) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = `<span class="n">${s.n}</span>`;
  b.appendChild(document.createTextNode(s.title));
  b.dataset.step = s.n;
  b.onclick = () => { stopAuto(); goStep(s.n); };
  li.appendChild(b);
  $('#steps').appendChild(li);
}
$('#prev').onclick = () => { stopAuto(); goStep(state.step - 1); };
$('#next').onclick = () => { stopAuto(); goStep(state.step + 1); };
$('#reset').onclick = () => { stopAuto(); goStep(1); };
$('#auto').onclick = () => (autoplay ? stopAuto() : startAuto());
$('#clean').onclick = () => document.body.classList.toggle('clean');
$('#helpBtn').onclick = () => $('#help').classList.toggle('hidden');
$('#helpClose').onclick = () => $('#help').classList.add('hidden');
$('#cam').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    grab = document.createElement('canvas'); grab.width = 640; grab.height = 480;
    pipeline.reset();
    $('#srcBadge').textContent = '📷 webcam';
  } catch (e) { toast(`Camera not available (${e.name || e.message}) — staying with the synthetic scene.`); }
};
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowRight') { stopAuto(); goStep(state.step + 1); }
  else if (k === 'ArrowLeft') { stopAuto(); goStep(state.step - 1); }
  else if (/^[0-9]$/.test(k)) { stopAuto(); goStep(+k); }
  else if (k === 'r' || k === 'R') { stopAuto(); goStep(1); }
  else if (k === 'a' || k === 'A') (autoplay ? stopAuto() : startAuto());
  else if (k === 'f' || k === 'F') document.body.classList.toggle('clean');
  else if (k === '?') $('#help').classList.toggle('hidden');
  else if (k === 'Escape') $('#help').classList.add('hidden');
  else return;
  e.preventDefault();
});

// ---------------------------------------------------------------- render
function render() {
  const s = STEPS[state.step];
  const icon = state.mode === 'plain' ? '🚫' : MODES[state.mode].secure ? '🔒' : '⚠';
  $('#modeBadge').textContent = `${icon} ${MODES[state.mode].label}${state.mitmActive ? '  ·  🔀 MITM ACTIVE' : ''}`;
  $('#modeBadge').className = `badge st-mode ${MODES[state.mode].secure ? 'ok' : 'warn'}`;
  $('#stepBadge').textContent = `Step ${state.step} of ${STEPS.length - 1}`;
  $('#autoBadge').classList.toggle('hidden', !autoplay);
  $('#auto').textContent = autoplay ? '■ Stop' : '▶ Auto';
  for (const b of document.querySelectorAll('[data-step]')) b.classList.toggle('active', +b.dataset.step === state.step);
  $('#capTitle').textContent = `Step ${s.n} · ${s.title}`;
  $('#capText').textContent = s.caption;
  $('#capFormula').textContent = s.formula || '';
  $('#overlay').textContent = state.overlay || '';
  $('#overlay').classList.toggle('hidden', !state.overlay);
  const sub = $('#subActions');
  if (sub.dataset.step !== String(state.step)) {
    sub.dataset.step = String(state.step);
    sub.innerHTML = '';
    for (const sa of s.subActions || []) {
      const b = document.createElement('button');
      b.className = 'btn danger'; b.textContent = sa.label;
      b.onclick = () => { stopAuto(); for (const t of timers) clearTimeout(t); timers = []; runActions(sa.actions); };
      sub.appendChild(b);
    }
  }
  const sa = sess?.safety.alice, sb = sess?.safety.bob;
  $('#snA').textContent = sa || '…'; $('#snB').textContent = sb || '…';
  $('#sAlice').textContent = sa || '…'; $('#sBob').textContent = sb || '…';
  const v = $('#snVerdict');
  const m = sa && sb ? sa === sb : null;
  v.className = `st-verdict ${m === true ? 'match' : m === false ? 'mismatch' : ''}`;
  v.textContent = m === true ? '✓ MATCH' : m === false ? '✗ MISMATCH' : '… waiting';
}
setInterval(() => { bobFps = bobFrames; bobFrames = 0; }, 1000);
setInterval(refreshBob, 250);
function refreshBob() {
  $('#cAcc').textContent = `✓ accepted ${counts.accepted}`;
  $('#cTam').textContent = `🛡 tampered ${counts.tamper}`;
  $('#cRep').textContent = `⟲ replayed ${counts.replay}`;
  $('#cDec').textContent = `⚠ errors ${counts.decrypt}`;
  for (const [id, n] of [['#cTam', counts.tamper], ['#cRep', counts.replay], ['#cDec', counts.decrypt]]) $(id).className = `badge ${n ? 'bad' : ''}`;
  $('#bobAcc').textContent = `✓ ${counts.accepted}`;
  const rej = counts.tamper + counts.replay + counts.decrypt;
  $('#bobRej').textContent = `✗ ${rej}`; $('#bobRej').className = `badge ${rej ? 'bad' : ''}`;
  const el = $('#bobAlert');
  if (Date.now() - lastBadAt < 1500) { el.className = 'st-alert bad'; el.textContent = `⛔ ${lastBad}`; }
  else {
    $('#bobBar').classList.add('hidden');
    if (Date.now() - lastOkAt < 1500) { el.className = 'st-alert ok'; el.textContent = MODES[mode]?.integrity ? '✓ Tag + counter verified — accepted' : '✓ Accepted — this mode has no checks'; }
    else { el.className = 'st-alert'; el.textContent = 'Waiting for frames…'; }
  }
}

window.__ciphercam = {
  role: 'solo',
  get step() { return state.step; }, state, counts,
  get bobFps() { return bobFps; },
  get leak() { return eve.stats.leak; },
  get eve() { return eve.stats; },
  get safetyMatch() { const s = sess?.safety; return s?.alice && s?.bob ? s.alice === s.bob : null; },
  goStep: (n) => { stopAuto(); goStep(n); },
};

if (ok) {
  eve.setState(state);
  goStep(1);
  setTimeout(tick, 50);
}
