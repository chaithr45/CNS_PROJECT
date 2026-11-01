// public/js/alice.js — Alice: capture → downscale → smooth → posterize → encrypt → send.
import { $, initPage, setupAesJs, toast, createScreen, oobChannel, isEmbed } from '/js/common.js';
import { connectWS } from '/js/net.js';
import { MODES, MODE_IDS, generateKeyPair, deriveSessionKeys, safetyNumber, toBase64, fromBase64 } from '/shared/crypto.js';
import { createPipeline, createSyntheticScene, downscaleToLuma, makeSplashFrame, SPLASH_FRAMES } from '/shared/frame.js';
import { createSenderSession, buildFrame } from '/shared/sender.js';
import { encodeMessage } from '/shared/protocol.js';

const ok = initPage({ needsCrypto: true });
await setupAesJs();

const screen = createScreen($('#preview'));
const pipeline = createPipeline();
const scene = createSyntheticScene();
const splash = makeSplashFrame();
const oob = oobChannel();

let state = null;
let session = null;          // { sid, mode, kp, keys, tx, seq, peerPub, safety }
let gen = 0;                 // bumps on every new session, to ignore late async results
let source = 'synthetic';
let video = $('#video');
let grab = null;             // offscreen 640×480 canvas for webcam frames
let stream = null;
let busy = false;
let bytesThisSec = 0;
let stats = { sent: 0, skipped: 0, errors: 0 };
let peerSafety = null;       // what Bob's page says (over the out-of-band channel)

// ---------------------------------------------------------------- UI setup
for (const id of MODE_IDS) {
  const o = document.createElement('option');
  o.value = id; o.textContent = MODES[id].label;
  $('#mode').appendChild(o);
}
const net = connectWS('alice', { onMessage, indicator: $('#conn'), onReplaced });

// Another Alice page (e.g. a second tab) took over. Offer a one-click way back.
function onReplaced() {
  const w = $('#wait');
  w.textContent = '⚠ Another Alice page took over. Click here to use this one again.';
  w.classList.remove('hidden');
  w.style.cursor = 'pointer';
  w.onclick = () => { w.onclick = null; w.style.cursor = ''; w.textContent = 'Reconnecting…'; replacedAt = Date.now(); net.reconnect(); };
  replacedAt = Infinity;
}
let replacedAt = 0;

$('#mode').onchange = (e) => net.control({ mode: e.target.value });
$('#source').onchange = (e) => net.control({ source: e.target.value });
$('#away').onchange = (e) => net.control({ away: e.target.checked });
$('#wave').onchange = (e) => net.control({ wave: e.target.checked });
$('#restart').onclick = () => net.restart();
for (const k of ['levels', 'fps', 'margin']) {
  $(`#${k}`).oninput = (e) => { $(`#${k}V`).textContent = e.target.value; };
  $(`#${k}`).onchange = (e) => net.control({ [k]: parseInt(e.target.value, 10) });
}

function setStatus(text, cls = '') {
  const s = $('#status');
  s.className = `alert ${cls}`;
  s.textContent = text;
}

function showSafety() {
  const n = session?.safety;
  $('#safety').textContent = n || 'waiting for the key exchange…';
  $('#safety').className = n ? 'safety' : 'safety pending';
  $('#eSafety').textContent = n || '…';
  if (n && peerSafety && peerSafety.sid === session.sid) {
    const match = peerSafety.number === n;
    $('#oob').innerHTML = match
      ? '<span style="color:var(--ok)">✓ Out-of-band check (like reading the numbers aloud): Bob has the same number.</span>'
      : '<span style="color:var(--bad)">✗ Out-of-band check (like reading the numbers aloud): Bob has a DIFFERENT number — someone is in the middle!</span>';
  } else {
    $('#oob').textContent = 'Out-of-band check (like reading the numbers aloud): —';
  }
}

oob.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m && m.type === 'safety' && m.role === 'bob') { peerSafety = m; showSafety(); }
  if (m && m.type === 'ask' && session?.safety) postSafety();
});
function postSafety() {
  if (session?.safety) oob.postMessage({ type: 'safety', role: 'alice', sid: session.sid, number: session.safety });
}

// ---------------------------------------------------------------- state + handshake
function onMessage({ header }) {
  switch (header.t) {
    case 'state': onState(header.state); break;
    case 'hello': if (header.role === 'bob') onHello(header).catch((e) => setStatus(`Key exchange failed: ${e.message}`, 'bad')); break;
    case 'peer-joined': if (header.role === 'bob') sendHello(); break;
    case 'error': if (header.code !== 'replaced') toast(header.text); else setStatus(header.text, 'bad'); break;
    default:
  }
}

function onState(s) {
  state = s;
  $('#mode').value = s.mode;
  $('#source').value = s.source;
  $('#away').checked = s.away;
  $('#wave').checked = s.wave;
  for (const k of ['levels', 'fps', 'margin']) { $(`#${k}`).value = s[k]; $(`#${k}V`).textContent = s[k]; }
  $('#eModeBadge').textContent = MODES[s.mode].label;
  if (s.source !== source) switchSource(s.source);
  if (!session || session.sid !== s.sid) startSession(s).catch((e) => setStatus(`Could not start: ${e.message}`, 'bad'));
}

async function startSession(s) {
  const my = ++gen;
  session = { sid: s.sid, mode: s.mode, kp: null, keys: null, tx: null, seq: 0, peerPub: null, safety: null };
  // 'plain' needs no keys, so Alice can send straight away.
  if (s.mode === 'plain') session.tx = createSenderSession({ sid: s.sid, mode: 'plain', levels: s.levels });
  showSafety();
  setStatus('New session: making a fresh ECDH key pair…');
  const kp = await generateKeyPair();          // fresh P-256 key pair for this session
  if (my !== gen) return;
  session.kp = kp;
  sendHello();
  setStatus(s.mode === 'plain' ? 'Sending WITHOUT encryption' : 'Sent my public key — waiting for Bob…');
}

function sendHello() {
  if (session?.kp) net.send({ t: 'hello', sid: session.sid, role: 'alice', pub: toBase64(session.kp.pubRaw) });
}

async function onHello(h) {
  if (!session || h.sid !== session.sid || !session.kp) return;
  const my = gen;
  const peer = fromBase64(h.pub);
  // ECDH + HKDF: combine my private key with Bob's public key → the session keys.
  const keys = await deriveSessionKeys(session.kp.privateKey, peer, h.sid);
  const sn = await safetyNumber(session.kp.pubRaw, peer);
  if (my !== gen) return;
  session.peerPub = peer;
  session.keys = keys;
  session.safety = sn;
  if (session.mode !== 'plain') session.tx = createSenderSession({ sid: session.sid, mode: session.mode, keys, levels: state.levels });
  showSafety();
  postSafety();
  setStatus(`🔒 Keys agreed — sending in ${MODES[session.mode].label}`, 'ok');
}

// ---------------------------------------------------------------- video sources
async function switchSource(want) {
  source = want;
  $('#srcBadge').textContent = want === 'webcam' ? '📷 webcam' : '◎ synthetic';
  if (want !== 'webcam') { stopCamera(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    video.srcObject = stream;
    await video.play();
    grab = document.createElement('canvas');
    grab.width = 640; grab.height = 480;
    pipeline.reset();
  } catch (e) {
    stopCamera();
    source = 'synthetic';
    $('#srcBadge').textContent = '◎ synthetic';
    toast(`Camera not available (${e.name || e.message}) — switched to the synthetic scene.`);
    net.control({ source: 'synthetic' });
  }
}
function stopCamera() {
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
}

function captureLuma(now) {
  if (source === 'webcam' && stream && video.readyState >= 2) {
    const g = grab.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, 640, 480);              // camera picture, scaled to 640×480
    const rgba = g.getImageData(0, 0, 640, 480).data;
    return downscaleToLuma(rgba, 640, 480);          // our own 4×4 area-average → 160×120
  }
  return scene.render(now, { away: state?.away, wave: state?.wave });
}

// ---------------------------------------------------------------- the frame loop
async function tick() {
  const fps = state?.fps || 10;
  const started = performance.now();
  try {
    if (state && ok) {
      const pixels = pipeline.process(captureLuma(started), { levels: state.levels, margin: state.margin });
      const s = session;
      const canSend = s && s.tx && net.connected;
      const out = canSend && s.seq < SPLASH_FRAMES ? splash : pixels;  // first second = the public test card
      screen.gray(out);
      $('#splashBadge').classList.toggle('hidden', !(canSend && s.seq < SPLASH_FRAMES));
      $('#wait').classList.toggle('hidden', !!canSend);
      if (!canSend && replacedAt !== Infinity) $('#wait').textContent = net.connected ? 'Waiting for Bob…' : 'Connecting to the relay…';
      if (canSend && !busy) {
        if (net.bufferedAmount > 200 * 1024) { stats.skipped++; }          // network is backed up: skip
        else {
          busy = true;
          try {
            s.tx.levels = state.levels;
            const f = await buildFrame(s.tx, out, s.seq);
            if (s === session) {
              net.sendRaw(encodeMessage(f.headerBytes, f.payload));
              s.seq++;
              stats.sent++;
              bytesThisSec += f.payload.length + f.headerBytes.length + 4;
              $('#seq').textContent = s.seq; $('#eSeq').textContent = `seq ${s.seq}`;
            }
          } catch (e) {
            stats.errors++;
            setStatus(`Encryption error: ${e.message}`, 'bad');
          } finally { busy = false; }
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  setTimeout(tick, Math.max(0, 1000 / fps - (performance.now() - started)));
}
setTimeout(tick, 50);
setInterval(() => { $('#rate').textContent = (bytesThisSec / 1024).toFixed(0); bytesThisSec = 0; }, 1000);

// Debug hook for the Stage and the end-to-end tests.
window.__ciphercam = {
  role: 'alice',
  get sid() { return session?.sid; },
  get mode() { return session?.mode; },
  get seq() { return session?.seq || 0; },
  get safety() { return session?.safety || null; },
  get source() { return source; },
  get ready() { return !!session?.tx; },
  stats,
  embed: isEmbed,
};
