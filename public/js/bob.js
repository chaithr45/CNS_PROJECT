// public/js/bob.js — Bob: receive → check tag → check counter → decrypt → show.
import { $, initPage, setupAesJs, createScreen, oobChannel, isEmbed, toast } from '/js/common.js';
import { connectWS } from '/js/net.js';
import { MODES, generateKeyPair, deriveSessionKeys, safetyNumber, toBase64, fromBase64 } from '/shared/crypto.js';
import { createReceiverState, receiveFrame } from '/shared/receiver.js';

const ok = initPage({ needsCrypto: true });
await setupAesJs();

const screen = createScreen($('#video'));
screen.clear(0);
const oob = oobChannel();

let state = null;
let session = null;           // { sid, kp, keys, rx, safety }
let gen = 0;
let chain = Promise.resolve();
let peerSafety = null;
const counts = { accepted: 0, tamper: 0, replay: 0, decrypt: 0 };   // this session
const totals = { accepted: 0, tamper: 0, replay: 0, decrypt: 0 };   // earlier sessions
let last = { ok: null, kind: null, reason: 'waiting', at: 0 };
let lastOkAt = 0, lastBadAt = 0, latency = 0, fps = 0, framesThisSec = 0;
let lastLoggedKind = null, lastLogAt = 0;
let mode = null;
const csvRows = [];
let secAcc = 0, secRej = { tamper: 0, replay: 0, decrypt: 0 };
let alertTimer = null;

const net = connectWS('bob', { onMessage, indicator: $('#conn') });

function setStatus(text, cls = '') {
  $('#status').className = `alert ${cls}`;
  $('#status').textContent = text;
  $('#eStatus').className = `badge ${cls}`;
  $('#eStatus').textContent = text.length > 44 ? text.slice(0, 42) + '…' : text;
}

function showSafety() {
  const n = session?.safety;
  $('#safety').textContent = n || 'waiting for the key exchange…';
  $('#safety').className = n ? 'safety' : 'safety pending';
  $('#eSafety').textContent = n || '…';
  if (n && peerSafety && peerSafety.sid === session.sid) {
    $('#oob').innerHTML = peerSafety.number === n
      ? '<span style="color:var(--ok)">✓ Out-of-band check (like reading the numbers aloud): Alice has the same number.</span>'
      : '<span style="color:var(--bad)">✗ Out-of-band check (like reading the numbers aloud): Alice has a DIFFERENT number — someone is in the middle!</span>';
  } else $('#oob').textContent = 'Out-of-band check (like reading the numbers aloud): —';
}
oob.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m && m.type === 'safety' && m.role === 'alice') { peerSafety = m; showSafety(); }
  if (m && m.type === 'ask' && session?.safety) postSafety();
});
function postSafety() { if (session?.safety) oob.postMessage({ type: 'safety', role: 'bob', sid: session.sid, number: session.safety }); }

function onMessage(msg) {
  const { header } = msg;
  switch (header.t) {
    case 'state': onState(header.state); break;
    case 'hello': if (header.role === 'alice') onHello(header).catch((e) => setStatus(`Key exchange failed: ${e.message}`, 'bad')); break;
    case 'peer-joined': if (header.role === 'alice') sendHello(); break;
    case 'frame': {
      const hb = msg.headerBytes, pl = msg.payload;
      chain = chain.then(() => onFrame(hb, pl)).catch((e) => console.error(e));
      break;
    }
    case 'error': if (header.code !== 'replaced') toast(header.text); else setStatus(header.text, 'bad'); break;
    default:
  }
}

function onState(s) {
  state = s;
  if (!session || session.sid !== s.sid) startSession(s).catch((e) => setStatus(`Could not start: ${e.message}`, 'bad'));
}

async function startSession(s) {
  const my = ++gen;
  session = { sid: s.sid, kp: null, keys: null, rx: createReceiverState({ sid: s.sid }), safety: null };
  // New session: forget the old picture and the per-session counters.
  for (const k of Object.keys(counts)) { totals[k] += counts[k]; counts[k] = 0; }
  screen.clear(0);
  $('#wait').textContent = 'New session — waiting for the first valid frame…';
  $('#wait').classList.remove('hidden');
  $('#alertBar').classList.add('hidden');
  lastBadAt = 0; lastLoggedKind = null;
  last = { ok: null, kind: null, reason: 'new session', at: Date.now() };
  setStatus('New session: key exchange…');
  showSafety();
  const kp = await generateKeyPair();     // fresh ECDH key pair for this session
  if (my !== gen) return;
  session.kp = kp;
  sendHello();
}
function sendHello() { if (session?.kp) net.send({ t: 'hello', sid: session.sid, role: 'bob', pub: toBase64(session.kp.pubRaw) }); }

async function onHello(h) {
  if (!session || h.sid !== session.sid || !session.kp) return;
  const my = gen;
  const peer = fromBase64(h.pub);
  const keys = await deriveSessionKeys(session.kp.privateKey, peer, h.sid);  // ECDH + HKDF
  const sn = await safetyNumber(session.kp.pubRaw, peer);
  if (my !== gen) return;
  session.keys = keys;
  session.rx.keys = keys;
  session.safety = sn;
  showSafety();
  postSafety();
}

function flashAlert(reason) {
  const bar = $('#alertBar');
  bar.textContent = `⛔ ${reason}`;
  bar.classList.remove('hidden');
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => bar.classList.add('hidden'), 1500);
}

async function onFrame(headerBytes, payload) {
  if (!session) return;
  const r = await receiveFrame(session.rx, headerBytes, payload);
  if (r.header?.mode) {
    mode = r.header.mode;
    const integ = MODES[mode].integrity;
    $('#integ').className = `badge ${integ ? 'ok' : 'warn'}`;
    $('#integ').textContent = integ ? '🛡 Integrity: ON' : '⚠ Integrity: OFF';
    $('#modeBadge').textContent = MODES[mode].label;
  }
  if (r.ok) {
    screen.gray(r.pixels);
    counts.accepted++; secAcc++; framesThisSec++;
    lastOkAt = Date.now();
    latency = Math.max(0, Date.now() - r.header.ts);
    last = { ok: true, kind: 'ok', reason: 'accepted', at: lastOkAt, seq: r.header.seq, mode };
    $('#wait').classList.add('hidden');
    if (Date.now() - lastBadAt > 1200) setStatus(`✓ Frame #${r.header.seq} accepted`, 'ok');
    if (lastLoggedKind && lastLoggedKind !== 'ok' && Date.now() - lastBadAt > 1500) { lastLoggedKind = 'ok'; }
    return;
  }
  if (r.kind === 'tamper' || r.kind === 'replay' || r.kind === 'decrypt') {
    counts[r.kind]++; secRej[r.kind]++;
    lastBadAt = Date.now();
    last = { ok: false, kind: r.kind, reason: r.reason, at: lastBadAt, seq: r.header?.seq, mode };
    setStatus(`⛔ ${r.reason}`, 'bad');
    flashAlert(r.reason);
    // Tell the Stage's event log (not on every frame: once per kind, then every 3 s).
    if (r.kind !== lastLoggedKind || Date.now() - lastLogAt > 3000) {
      net.event(`Bob: ${r.reason}`, 'good');
      lastLoggedKind = r.kind; lastLogAt = Date.now();
    }
  }
  // 'stale' (old session) and 'nokey' (handshake not finished) are silently ignored.
}

function render() {
  $('#cAcc').textContent = counts.accepted;
  $('#cTamper').textContent = counts.tamper;
  $('#cReplay').textContent = counts.replay;
  $('#cDecrypt').textContent = counts.decrypt;
  $('#eAcc').textContent = `✓ ${counts.accepted}`;
  const rej = counts.tamper + counts.replay + counts.decrypt;
  $('#eRej').textContent = `✗ ${rej}`;
  $('#eRej').className = `badge ${rej ? 'bad' : ''}`;
  $('#lat').textContent = `latency ${latency} ms`;
  $('#fps').textContent = `${fps} fps`;
}
setInterval(() => {
  fps = framesThisSec; framesThisSec = 0;
  csvRows.push({ time: new Date().toISOString(), mode: mode || '', fps, latency_ms: latency, accepted: secAcc, rejected_tamper: secRej.tamper, rejected_replay: secRej.replay, rejected_decrypt: secRej.decrypt });
  if (csvRows.length > 3600) csvRows.shift();
  secAcc = 0; secRej = { tamper: 0, replay: 0, decrypt: 0 };
  render();
}, 1000);

$('#csv').onclick = () => {
  const cols = ['time', 'mode', 'fps', 'latency_ms', 'accepted', 'rejected_tamper', 'rejected_replay', 'rejected_decrypt'];
  const text = [cols.join(','), ...csvRows.map((r) => cols.map((c) => r[c]).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `ciphercam-bob-stats-${Date.now()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// Debug hook for the Stage and the end-to-end tests.
window.__ciphercam = {
  role: 'bob',
  counts,
  get totals() { const t = {}; for (const k in counts) t[k] = totals[k] + counts[k]; return t; },
  get last() { return last; },
  get fps() { return fps; },
  get latency() { return latency; },
  get safety() { return session?.safety || null; },
  get sid() { return session?.sid; },
  get mode() { return mode; },
  get lastOkAt() { return lastOkAt; },
  get lastBadAt() { return lastBadAt; },
  get secure() { return ok; },
  embed: isEmbed,
};
