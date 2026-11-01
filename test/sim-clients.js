// test/sim-clients.js — Alice and Bob as plain Node.js WebSocket clients.
// They use exactly the same shared/ sender and receiver code as the browser pages,
// so the whole Alice → relay (+ Eve) → Bob pipeline can be tested without a browser.
import WebSocket from 'ws';
import './helpers.js';
import { generateKeyPair, deriveSessionKeys, safetyNumber, toBase64, fromBase64 } from '../shared/crypto.js';
import { encodeMessage, decodeMessage } from '../shared/protocol.js';
import { createSenderSession, buildFrame } from '../shared/sender.js';
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { makeSplashFrame, SPLASH_FRAMES } from '../shared/frame.js';

export function waitFor(cond, ms = 5000, what = 'condition') {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let v; try { v = cond(); } catch { v = false; }
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return reject(new Error(`timeout waiting for ${what}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

export function connect(port, role, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=${role}`, { headers });
  ws.binaryType = 'nodebuffer';
  const c = { ws, role, state: null, messages: [], closed: null };
  ws.on('message', (data) => {
    const m = decodeMessage(data);
    if (m.header.t === 'state') c.state = m.header.state;
    c.messages.push(m);
    c.onMessage?.(m);
  });
  ws.on('close', (code, reason) => { c.closed = { code, reason: String(reason) }; });
  c.open = new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); ws.once('close', () => res()); });
  c.send = (header, payload) => ws.send(encodeMessage(header, payload));
  c.control = (patch) => c.send({ t: 'control', patch });
  c.close = () => ws.close();
  return c;
}

// Common handshake logic for Alice and Bob.
function party(port, role) {
  const c = connect(port, role);
  c.sid = null; c.kp = null; c.keys = null; c.safety = null; c.peerPub = null;
  let gen = 0;
  async function startSession(sid) {
    const my = ++gen;
    // Forget the previous session's key pair too (like the pages, which start a fresh
    // session object): a fast peer's hello must never be combined with an OLD private key.
    c.sid = sid; c.kp = null; c.keys = null; c.safety = null; c.peerPub = null; c.earlyHello = null;
    c.onNewSession?.(sid);
    const kp = await generateKeyPair();
    if (my !== gen) return;
    c.kp = kp;
    c.send({ t: 'hello', sid, role, pub: toBase64(kp.pubRaw) });
    // The peer's key may have arrived while ours was still being made (same as the pages).
    if (c.earlyHello?.sid === sid) onHello(c.earlyHello).catch(() => {});
  }
  async function onHello(h) {
    if (h.sid !== c.sid) return;
    if (!c.kp) { c.earlyHello = h; return; }
    const peer = fromBase64(h.pub);
    const my = gen;
    const keys = await deriveSessionKeys(c.kp.privateKey, peer, h.sid);
    const sn = await safetyNumber(c.kp.pubRaw, peer);
    if (my !== gen) return;
    c.peerPub = peer; c.keys = keys; c.safety = sn;
    c.onKeys?.(keys);
  }
  c.onMessage = (m) => {
    const h = m.header;
    if (h.t === 'state' && h.state.sid !== c.sid) startSession(h.state.sid);
    else if (h.t === 'hello') onHello(h).catch(() => {});
    else if (h.t === 'peer-joined' && c.kp && c.sid) c.send({ t: 'hello', sid: c.sid, role, pub: toBase64(c.kp.pubRaw) });
    c.onOther?.(m);
  };
  return c;
}

export function simAlice(port) {
  const a = party(port, 'alice');
  a.seq = 0;
  a.onNewSession = () => { a.seq = 0; a.tx = null; };
  a.onKeys = (keys) => { a.tx = createSenderSession({ sid: a.sid, mode: a.state.mode, keys, levels: 4 }); };
  a.ready = () => !!a.tx && a.tx.sid === a.sid;
  // Send one frame: splash for the first 10, then the given pixels.
  a.sendFrame = async (pixels) => {
    const px = a.seq < SPLASH_FRAMES ? makeSplashFrame() : pixels;
    const f = await buildFrame(a.tx, px, a.seq++);
    a.ws.send(encodeMessage(f.headerBytes, f.payload));
    return f;
  };
  return a;
}

export function simBob(port) {
  const b = party(port, 'bob');
  b.results = [];
  b.onNewSession = (sid) => { b.rx = createReceiverState({ sid }); b.results = []; };
  b.onKeys = (keys) => { b.rx.keys = keys; };
  let chain = Promise.resolve();
  b.onOther = (m) => {
    if (m.header.t !== 'frame') return;
    const hb = m.headerBytes.slice(), pl = m.payload.slice();
    chain = chain.then(async () => { if (b.rx) b.results.push(await receiveFrame(b.rx, hb, pl)); });
  };
  b.count = (pred) => b.results.filter(pred).length;
  return b;
}
