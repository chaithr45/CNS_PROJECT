// public/js/stage.js — the projector view: three panels, captions, the scripted demo.
import { $, initPage, oobChannel } from '/js/common.js';
import { connectWS } from '/js/net.js';
import { STEPS, stepPatch } from '/shared/steps.js';
import { MODES } from '/shared/crypto.js';

initPage({ needsCrypto: true });

const params = new URLSearchParams(location.search);
let state = null;
let timers = [];             // pending timed actions of the current step
let autoplay = false;
let autoTimer = null;
let autoLoop = params.get('loop') === '1';
const safety = { alice: null, bob: null };
const events = [];

const net = connectWS('stage', { onMessage, indicator: $('#conn') });

// ---------------------------------------------------------------- server messages
function onMessage({ header }) {
  if (header.t === 'state') { state = header.state; render(); refreshBob(); }
  if (header.t === 'event') addEvent(header);
}

function addEvent(e) {
  events.push(e);
  if (events.length > 50) events.shift();
  const ol = $('#log');
  ol.innerHTML = '';
  for (const ev of events.slice(-8)) {
    const li = document.createElement('li');
    li.className = ev.level;
    const t = new Date(ev.ts).toLocaleTimeString([], { hour12: false });
    li.innerHTML = `<span class="t">${t}</span>`;
    li.appendChild(document.createTextNode(ev.text));
    ol.appendChild(li);
  }
}

// ---------------------------------------------------------------- steps
function stepButtons() {
  const ol = $('#steps');
  for (const s of STEPS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<span class="n">${s.n}</span>`;
    b.appendChild(document.createTextNode(s.title));
    b.dataset.step = s.n;
    b.onclick = () => { stopAuto(); goStep(s.n); };
    li.appendChild(b);
    ol.appendChild(li);
  }
}
stepButtons();

function clearTimers() { for (const t of timers) clearTimeout(t); timers = []; }

// Run a list of timed actions ({ at, patch, overlay }).
function runActions(actions) {
  for (const a of actions || []) {
    timers.push(setTimeout(() => {
      const patch = { ...(a.patch || {}) };
      if ('overlay' in a) patch.overlay = a.overlay;
      net.control(patch);
    }, a.at));
  }
}

function goStep(n) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));
  clearTimers();
  net.control(stepPatch(n));         // full configuration + fresh session
  runActions(STEPS[n].actions);
  current = n;
  render();
}
let current = 1;

function subAction(sa) { clearTimers(); runActions(sa.actions); }

// ---------------------------------------------------------------- auto-play
function startAuto(from = 0) {
  autoplay = true;
  net.control({ autoplay: true });
  let n = from;
  const next = () => {
    if (!autoplay) return;
    if (n >= STEPS.length) {
      if (!autoLoop) { stopAuto(); return; }
      n = 0;
    }
    goStep(n);
    const dur = STEPS[n].duration;
    n++;
    autoTimer = setTimeout(next, dur);
  };
  next();
  render();
}
function stopAuto() {
  if (!autoplay) return;
  autoplay = false;
  clearTimeout(autoTimer);
  net.control({ autoplay: false });
  render();
}

function reset() {
  stopAuto();
  goStep(1);
}

// ---------------------------------------------------------------- buttons + keys
$('#prev').onclick = () => { stopAuto(); goStep((state?.step ?? current) - 1); };
$('#next').onclick = () => { stopAuto(); goStep((state?.step ?? current) + 1); };
$('#reset').onclick = reset;
$('#auto').onclick = () => (autoplay ? stopAuto() : startAuto(0));
$('#clean').onclick = () => document.body.classList.toggle('clean');
for (const [id, m] of Object.entries(MODES)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = m.label;
  $('#modeSel').appendChild(o);
}
$('#modeSel').onchange = (e) => { net.control({ mode: e.target.value }); e.target.blur(); };
$('#srcSel').onchange = (e) => { net.control({ source: e.target.value }); e.target.blur(); }; // blur: arrow keys go back to the steps
$('#lvlSel').onchange = (e) => { net.control({ levels: parseInt(e.target.value, 10) }); e.target.blur(); };
$('#helpBtn').onclick = () => $('#help').classList.toggle('hidden');
$('#helpClose').onclick = () => $('#help').classList.add('hidden');

function onKey(key) {
  const step = state?.step ?? current;
  if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') { stopAuto(); goStep(step + 1); }
  else if (key === 'ArrowLeft' || key === 'PageUp') { stopAuto(); goStep(step - 1); }
  else if (/^[0-9]$/.test(key)) { stopAuto(); goStep(Math.min(STEPS.length - 1, parseInt(key, 10))); }
  else if (key === 'r' || key === 'R') reset();
  else if (key === 'a' || key === 'A') (autoplay ? stopAuto() : startAuto(0));
  else if (key === 'f' || key === 'F') document.body.classList.toggle('clean');
  else if (key === '?' || key === '/') $('#help').classList.toggle('hidden');
  else if (key === 'Escape') $('#help').classList.add('hidden');
}
document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp'].includes(e.key)) e.preventDefault();
  onKey(e.key);
});
// Keys pressed while an iframe has focus are forwarded here (see common.js).
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'stage-key') onKey(e.data.key);
});

// ---------------------------------------------------------------- safety numbers (out-of-band)
const oob = oobChannel();
oob.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m?.type === 'safety' && (m.role === 'alice' || m.role === 'bob')) { safety[m.role] = m; renderSafety(); }
});
oob.postMessage({ type: 'ask' });

function safetyMatch() {
  const a = safety.alice, b = safety.bob;
  if (!state || !a || !b || a.sid !== state.sid || b.sid !== state.sid) return null;
  return a.number === b.number;
}
function renderSafety() {
  const sid = state?.sid;
  const a = safety.alice?.sid === sid ? safety.alice.number : null;
  const b = safety.bob?.sid === sid ? safety.bob.number : null;
  $('#snA').textContent = a || '…';
  $('#snB').textContent = b || '…';
  const m = safetyMatch();
  const v = $('#snVerdict');
  v.className = `st-verdict ${m === true ? 'match' : m === false ? 'mismatch' : ''}`;
  v.textContent = m === true ? '✓ MATCH' : m === false ? '✗ MISMATCH' : '… waiting';
}

// ---------------------------------------------------------------- render
function render() {
  if (!state) return;
  current = state.step;
  if (document.activeElement !== $('#modeSel')) $('#modeSel').value = state.mode;
  if (document.activeElement !== $('#srcSel')) $('#srcSel').value = state.source;
  if (document.activeElement !== $('#lvlSel')) $('#lvlSel').value = String(state.levels);
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
  const ov = $('#overlay');
  ov.textContent = state.overlay || '';
  ov.classList.toggle('hidden', !state.overlay);
  // sub-actions (e.g. step 6: "Try bit-flip", "Try replay")
  const sub = $('#subActions');
  const key = String(state.step);
  if (sub.dataset.step !== key) {
    sub.dataset.step = key;
    sub.innerHTML = '';
    for (const sa of s.subActions || []) {
      const b = document.createElement('button');
      b.className = 'btn danger';
      b.textContent = sa.label;
      b.dataset.sub = sa.id;
      b.onclick = () => { stopAuto(); subAction(sa); };
      sub.appendChild(b);
    }
  }
  renderSafety();
}

// Bob's status, read from his panel (same origin) four times a second.
const frames = { alice: $('#fAlice'), eve: $('#fEve'), bob: $('#fBob') };
const hook = (name) => { try { return frames[name].contentWindow.__ciphercam || null; } catch { return null; } };
// Only Bob's status for the CURRENT session is shown: right after a step change the old
// session's alerts and counters disappear at once instead of lingering.
const ZERO = { accepted: 0, tamper: 0, replay: 0, decrypt: 0 };
setInterval(refreshBob, 250);
function refreshBob() {
  const bob = hook('bob');
  if (!bob || !state) return;
  if (bob.sid !== state.sid) {
    showBob(ZERO);
    $('#bobAlert').className = 'st-alert';
    $('#bobAlert').textContent = '🔑 New session — exchanging keys…';
    return;
  }
  showBob(bob.counts);
  const last = bob.last;
  const el = $('#bobAlert');
  const recentBad = Date.now() - bob.lastBadAt < 1500;
  if (recentBad && last && !last.ok) { el.className = 'st-alert bad'; el.textContent = `⛔ ${last.reason}`; }
  else if (Date.now() - bob.lastOkAt < 1500) { el.className = 'st-alert ok'; el.textContent = MODES[bob.mode]?.integrity ? '✓ Tag + counter verified — accepted' : '✓ Accepted — this mode has no checks'; }
  else { el.className = 'st-alert'; el.textContent = 'Waiting for frames…'; }
}
function showBob(c) {
  $('#cAcc').textContent = `✓ accepted ${c.accepted}`;
  $('#cTam').textContent = `🛡 tampered ${c.tamper}`;
  $('#cRep').textContent = `⟲ replayed ${c.replay}`;
  $('#cDec').textContent = `⚠ errors ${c.decrypt}`;
  for (const [id, n] of [['#cTam', c.tamper], ['#cRep', c.replay], ['#cDec', c.decrypt]]) $(id).className = `badge ${n ? 'bad' : ''}`;
}

// QR code for audience phones.
(async () => {
  try {
    const info = await (await fetch('/api/info')).json();
    const url = info.lan[0]?.url || `http://${location.host}/watch`;
    $('#qrUrl').textContent = url.replace('http://', '');
    $('#qr').innerHTML = await (await fetch(`/api/qr.svg?text=${encodeURIComponent(url)}`)).text();
  } catch { /* optional */ }
})();

// Debug hook for the end-to-end tests (and curious students).
window.__ciphercam = {
  role: 'stage',
  get step() { return state?.step; },
  get state() { return state; },
  get autoplay() { return autoplay; },
  get alice() { return hook('alice'); },
  get eve() { return hook('eve'); },
  get bob() { return hook('bob'); },
  get counters() { return hook('bob')?.counts; },
  get bobLast() { return hook('bob')?.last; },
  get leak() { return hook('eve')?.stats.leak; },
  get safety() { return { alice: safety.alice?.number, bob: safety.bob?.number }; },
  get safetyMatch() { return safetyMatch(); },
  events,
  goStep: (n) => { stopAuto(); goStep(n); },
  subAction: (id) => { const sa = STEPS[state.step].subActions?.find((x) => x.id === id); if (sa) subAction(sa); },
  startAuto, stopAuto, reset,
};
