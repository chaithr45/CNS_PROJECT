// server/app.js — the CipherCam relay server = "the network" between Alice and Bob.
//
// It does four jobs:
//   1. Serves the web pages (public/), the shared code (/shared) and aes-js (/vendor).
//   2. Relays WebSocket messages: Alice's frames → Bob, copies → Eve and audience phones.
//   3. Owns the single shared `state` (mode, attacks, demo step, ...) and broadcasts it.
//   4. Runs Eve's ACTIVE attacks on frames passing through (see eve-active.js).
//
// Security rule: only clients connecting from this laptop (127.0.0.1 / ::1) may change
// anything. Phones on /watch can only watch.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

import { setAesJs } from '../shared/ecb.js';
import { MODE_IDS, MODES, fromBase64, toBase64 } from '../shared/crypto.js';
import { encodeMessage, decodeMessage, T } from '../shared/protocol.js';
import { STAMPS, makeStampMask } from '../shared/stamps.js';
import { applyBitflip, createReplay, createMitm } from './eve-active.js';
import { STEPS } from '../shared/steps.js';

const require = createRequire(import.meta.url);
setAesJs(require('aes-js')); // ECB in Node (needed when Eve re-encrypts ECB frames during MITM)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const AESJS = require.resolve('aes-js');

export const EVE_VIEWS = ['raw', 'blocks', 'xor', 'keystream'];
export const REPLAY_PHASES = ['off', 'recording', 'ready', 'looping'];
const ROLES = ['alice', 'bob', 'eve', 'watch', 'stage'];
const MAX_WATCHERS = 40;
const PAGES = { '/': 'index.html', '/stage': 'stage.html', '/alice': 'alice.html', '/bob': 'bob.html', '/eve': 'eve.html', '/watch': 'watch.html', '/selftest': 'selftest.html', '/solo': 'solo.html' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webm': 'video/webm', '.mp4': 'video/mp4' };

export function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' || a.family === 4) out.push({ name, address: a.address, internal: a.internal });
  }
  return out;
}

const newSid = () => crypto.randomBytes(4).toString('hex');

export function initialState() {
  return {
    v: 0,
    sid: newSid(),
    mode: 'ctr',
    levels: 4, fps: 10, margin: 6,
    source: 'synthetic',
    away: false, wave: false,
    eveView: 'raw', leakHighlight: false,
    attacks: { bitflip: { on: false, stamp: 'star' }, replay: { phase: 'off', seconds: 5, recorded: 0 }, mitm: { on: false } },
    mitmActive: false,          // true when Eve really is in the middle of the CURRENT session
    step: 1, autoplay: false, overlay: null,
    watchFps: 4,
    peers: { alice: false, bob: false }, watchers: 0,
  };
}

// Keep only known keys with valid values. Anything else in a patch is ignored.
export function sanitizePatch(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (MODE_IDS.includes(p.mode)) out.mode = p.mode;
  if (int(p.levels, 2, 6)) out.levels = p.levels;
  if (int(p.fps, 5, 15)) out.fps = p.fps;
  if (int(p.margin, 0, 40)) out.margin = p.margin;
  if (int(p.watchFps, 1, 10)) out.watchFps = p.watchFps;
  if (p.source === 'synthetic' || p.source === 'webcam') out.source = p.source;
  for (const k of ['away', 'wave', 'leakHighlight', 'autoplay', 'restart']) if (typeof p[k] === 'boolean') out[k] = p[k];
  if (EVE_VIEWS.includes(p.eveView)) out.eveView = p.eveView;
  if (int(p.step, 0, STEPS.length - 1)) out.step = p.step;
  if (p.overlay === null || (typeof p.overlay === 'string' && p.overlay.length <= 160)) out.overlay = p.overlay;
  const a = p.attacks;
  if (a && typeof a === 'object') {
    out.attacks = {};
    if (a.bitflip && typeof a.bitflip === 'object') {
      const b = {};
      if (typeof a.bitflip.on === 'boolean') b.on = a.bitflip.on;
      if (a.bitflip.stamp in STAMPS) b.stamp = a.bitflip.stamp;
      out.attacks.bitflip = b;
    }
    if (a.replay && typeof a.replay === 'object') {
      const r = {};
      if (['off', 'recording', 'looping'].includes(a.replay.phase)) r.phase = a.replay.phase;
      if (int(a.replay.seconds, 1, 15)) r.seconds = a.replay.seconds;
      out.attacks.replay = r;
    }
    if (a.mitm && typeof a.mitm === 'object' && typeof a.mitm.on === 'boolean') out.attacks.mitm = { on: a.mitm.on };
  }
  return out;
}

async function listenWithFallback(server, port, host, tries) {
  for (let i = 0; i <= tries; i++) {
    const p = port === 0 ? 0 : port + i;
    try {
      await new Promise((resolve, reject) => {
        const onErr = (e) => { server.off('listening', onOk); reject(e); };
        const onOk = () => { server.off('error', onErr); resolve(); };
        server.once('error', onErr);
        server.once('listening', onOk);
        server.listen(p, host);
      });
      return server.address().port;
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || i === tries) throw e;
    }
  }
  throw new Error('no free port');
}

export async function createCipherServer({
  port = 8080, portTries = 10, host = '0.0.0.0', allowRemoteControl = false, log = console.log, quiet = false,
} = {}) {
  const state = initialState();
  const clients = new Set();        // { ws, role, local, id, lastWatch, lastWatchPlain }
  const events = [];                // recent event log lines (for newly connected Stages)
  const replay = createReplay();
  let loopTimer = null;
  let mitm = null;                  // { sid, promise, m } for the current session, when active
  let hellos = {};                  // latest hello per role for the current sid
  let seq0 = null;                  // the encoded seq-0 frame (splash) of the current session
  let chain = Promise.resolve();    // keeps Alice's frames in order (MITM work is async)
  let nextId = 1;
  const masks = {};
  const maskFor = (name) => (masks[name] ||= makeStampMask(name));
  const stats = { framesIn: 0, framesToBob: 0, dropped: 0 };

  const say = (...a) => { if (!quiet) log(...a); };

  // ---------------------------------------------------------------- helpers
  const send = (c, bytes) => { try { if (c.ws.readyState === 1) c.ws.send(bytes); } catch { /* ignore */ } };
  const byRole = (role) => [...clients].filter((c) => c.role === role);
  const sendRole = (role, bytes, maxBuffered = 4e6) => {
    for (const c of byRole(role)) {
      if (c.ws.bufferedAmount > maxBuffered) { stats.dropped++; continue; }
      send(c, bytes);
    }
  };
  function broadcastState() {
    state.v++;
    state.peers = { alice: byRole('alice').length > 0, bob: byRole('bob').length > 0 };
    state.watchers = byRole('watch').length;
    const msg = encodeMessage({ t: T.STATE, state });
    for (const c of clients) send(c, msg);
  }
  function event(text, level = 'info') {
    const e = { t: T.EVENT, text, level, ts: Date.now() };
    events.push(e);
    if (events.length > 30) events.shift();
    say(`  [${new Date().toLocaleTimeString()}] ${text}`);
    const msg = encodeMessage(e);
    for (const c of clients) if (c.role === 'stage' || c.role === 'eve') send(c, msg);
  }

  // ---------------------------------------------------------------- sessions
  function stopLoop() { if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; } }

  function restart(reason) {
    stopLoop();
    replay.clear();
    state.attacks.replay.phase = 'off';
    state.attacks.replay.recorded = 0;
    state.sid = newSid();
    hellos = {};
    seq0 = null;
    if (state.attacks.mitm.on) {
      const sid = state.sid;
      mitm = { sid, m: null, promise: createMitm(sid).then((m) => { if (mitm && mitm.sid === sid) mitm.m = m; return m; }) };
      state.mitmActive = true;
    } else {
      mitm = null;
      state.mitmActive = false;
    }
    event(`New session ${state.sid.slice(0, 4)} · ${MODES[state.mode].label}${state.mitmActive ? ' · MITM' : ''}`, state.mitmActive ? 'bad' : 'info');
    say(`    (restart reason: ${reason})`);
    broadcastState();
  }

  function startLoop() {
    const frames = replay.frames;
    if (!frames.length) { event('Replay: nothing recorded yet', 'warn'); state.attacks.replay.phase = 'off'; return; }
    stopLoop();
    let i = 0;
    let t0 = Date.now();
    const tick = () => {
      if (state.attacks.replay.phase !== 'looping') return;
      const f = frames[i];
      toBob(f.headerBytes, f.payload);
      i++;
      if (i >= frames.length) { i = 0; t0 = Date.now() + 100; }
      loopTimer = setTimeout(tick, Math.max(0, t0 + frames[i].t - Date.now()));
    };
    loopTimer = setTimeout(tick, 0);
  }

  // Apply a (sanitized) control patch to the state.
  function applyPatch(p, who) {
    let needRestart = !!p.restart;
    if (p.mode && p.mode !== state.mode) { state.mode = p.mode; needRestart = true; }
    for (const k of ['levels', 'fps', 'margin', 'watchFps', 'source', 'away', 'wave', 'eveView', 'leakHighlight', 'step', 'overlay', 'autoplay']) {
      if (k in p) state[k] = p[k];
    }
    const a = p.attacks || {};
    if (a.bitflip) {
      const was = state.attacks.bitflip.on;
      Object.assign(state.attacks.bitflip, a.bitflip);
      if (state.attacks.bitflip.on !== was) event(state.attacks.bitflip.on ? `Eve bit-flips: ${STAMPS[state.attacks.bitflip.stamp]}` : 'Eve stopped bit-flipping', state.attacks.bitflip.on ? 'bad' : 'info');
    }
    if (a.mitm && a.mitm.on !== state.attacks.mitm.on) {
      state.attacks.mitm.on = a.mitm.on;
      event(a.mitm.on ? 'Eve armed MITM (key swap)' : 'Eve disarmed MITM', a.mitm.on ? 'bad' : 'info');
      needRestart = true; // MITM only takes effect at a new key exchange
    }
    if (needRestart) restart(who);
    // Replay is applied after a restart (a restart clears any recording).
    if (a.replay) {
      const r = state.attacks.replay;
      if (a.replay.seconds) r.seconds = a.replay.seconds;
      if (a.replay.phase === 'recording') {
        stopLoop();
        replay.start(r.seconds);
        r.phase = 'recording'; r.recorded = 0;
        event(`Eve records ${r.seconds} s of frames`, 'bad');
      } else if (a.replay.phase === 'looping' && r.phase !== 'looping') {
        r.phase = 'looping';
        startLoop();
        if (r.phase === 'looping') event(`Eve loops ${(replay.duration / 1000).toFixed(1)} s of old frames`, 'bad');
      } else if (a.replay.phase === 'off' && r.phase !== 'off') {
        const wasLooping = r.phase === 'looping';
        stopLoop();
        r.phase = replay.frames.length ? 'ready' : 'off';
        if (wasLooping) event('Eve stopped the loop: live again');
      }
    }
    broadcastState();
  }

  // Send one frame to Bob, after Eve's bit-flip (if on).
  function toBob(headerBytes, payload) {
    let p = payload;
    if (state.attacks.bitflip.on) {
      let mode = 'plain';
      try { mode = JSON.parse(new TextDecoder().decode(headerBytes)).mode; } catch { /* keep plain */ }
      if (MODES[mode]) p = applyBitflip(mode, payload, maskFor(state.attacks.bitflip.stamp));
    }
    stats.framesToBob++;
    sendRole('bob', encodeMessage(headerBytes, p), 2e6);
  }

  function toWatchers(bytes, key, force = false) {
    const now = Date.now();
    const gap = 1000 / state.watchFps;
    for (const c of byRole('watch')) {
      if (!force && now - (c[key] || 0) < gap) continue;
      if (c.ws.bufferedAmount > 256e3) { stats.dropped++; continue; }
      c[key] = now;
      send(c, bytes);
    }
  }

  // ---------------------------------------------------------------- messages
  async function handleFrame(header, headerBytes, payload, raw) {
    if (header.sid !== state.sid) return;               // stale frame from an old session
    stats.framesIn++;
    // Passive copies: Eve's page and the audience phones see exactly what Alice sent.
    if (header.seq === 0) seq0 = raw;
    sendRole('eve', raw, 2e6);
    toWatchers(raw, 'lastWatch', header.seq === 0);

    let fwd = { headerBytes, payload };
    if (mitm && mitm.sid === header.sid) {
      const m = mitm.m || (await mitm.promise);
      if (!m.ready) return;                              // handshake not finished yet
      const t = await m.transform(headerBytes, payload);
      if (t.error) return;
      // Eve decrypted Alice's frame: send the plaintext to Eve's page and the watchers.
      const plainMsg = encodeMessage({ t: T.EVE_PLAIN, sid: header.sid, seq: header.seq, mode: header.mode, ts: header.ts }, t.pixels);
      sendRole('eve', plainMsg, 2e6);
      toWatchers(plainMsg, 'lastWatchPlain');
      fwd = t.forward;
    }
    const r = state.attacks.replay;
    if (r.phase === 'recording') {
      const done = replay.add(fwd.headerBytes, fwd.payload);
      r.recorded = replay.duration / 1000;
      if (done) {
        r.phase = 'ready';
        event(`Eve recorded ${replay.frames.length} frames`, 'bad');
        broadcastState();
      }
    }
    if (r.phase === 'looping') return;                   // Eve blocks live video while looping
    toBob(fwd.headerBytes, fwd.payload);
  }

  async function handleHello(c, header) {
    if (header.sid !== state.sid || (c.role !== 'alice' && c.role !== 'bob')) return;
    hellos[c.role] = header;
    const other = c.role === 'alice' ? 'bob' : 'alice';
    let pub = header.pub;
    if (mitm && mitm.sid === header.sid) {
      const m = mitm.m || (await mitm.promise);
      if (header.sid !== state.sid) return;
      const fake = await m.onHello(c.role, fromBase64(header.pub));
      pub = toBase64(fake);
      event(`Eve swapped ${c.role === 'alice' ? 'Alice' : 'Bob'}'s public key`, 'bad');
    } else {
      event(`${c.role === 'alice' ? 'Alice' : 'Bob'} sent her/his ECDH public key`.replace('her/his', c.role === 'alice' ? 'her' : 'his'));
    }
    sendRole(other, encodeMessage({ ...header, pub }));
  }

  async function onMessage(c, data) {
    let msg;
    const raw = new Uint8Array(data); // our own copy of the bytes
    try { msg = decodeMessage(raw); } catch { return; }
    const { header, headerBytes, payload } = msg;
    if (!header || typeof header.t !== 'string') return;
    switch (header.t) {
      case T.FRAME:
        if (c.role !== 'alice') return;
        chain = chain.then(() => handleFrame(header, headerBytes, payload, raw)).catch((e) => say('frame error', e.message));
        return;
      case T.HELLO:
        chain = chain.then(() => handleHello(c, header)).catch((e) => say('hello error', e.message));
        return;
      case T.CONTROL:
        if (!c.local) { send(c, encodeMessage({ t: T.ERROR, code: 'forbidden', text: 'Control is only allowed from the presenter laptop (localhost).' })); return; }
        applyPatch(sanitizePatch(header.patch), `${c.role} control`);
        return;
      case T.RESTART:
        if (!c.local) { send(c, encodeMessage({ t: T.ERROR, code: 'forbidden', text: 'Control is only allowed from the presenter laptop (localhost).' })); return; }
        restart(`${c.role} pressed Restart`);
        return;
      case T.EVENT:
        if (!c.local || c.role === 'watch') return;
        event(String(header.text || '').slice(0, 200), ['info', 'warn', 'bad', 'good'].includes(header.level) ? header.level : 'info');
        return;
      default:
    }
  }

  // ---------------------------------------------------------------- HTTP
  let boundPort = port;
  function lanInfo() {
    return lanAddresses().filter((a) => !a.internal).map((a) => ({ name: a.name, ip: a.address, url: `http://${a.address}:${boundPort}/watch` }));
  }
  function serveFile(res, file) {
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  }
  function safeJoin(base, rel) {
    const p = path.normalize(path.join(base, rel));
    return p.startsWith(base + path.sep) ? p : null;
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const pn = decodeURIComponent(url.pathname);
    try {
      if (PAGES[pn]) return serveFile(res, path.join(PUBLIC, PAGES[pn]));
      if (pn === '/vendor/aes-js/index.js') return serveFile(res, AESJS);
      if (pn === '/vectors.json') return serveFile(res, path.join(ROOT, 'test', 'vectors.json'));
      // Eve's attack code, so the single-page solo mode can run it in the browser too.
      if (pn === '/server/eve-active.js') return serveFile(res, path.join(ROOT, 'server', 'eve-active.js'));
      if (pn === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (pn === '/api/info') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ port: boundPort, lan: lanInfo(), stage: `http://localhost:${boundPort}/stage`, allowRemoteControl, stats }));
        return;
      }
      if (pn === '/api/qr.svg') {
        const text = (url.searchParams.get('text') || '').slice(0, 300);
        const svg = await QRCode.toString(text || `http://localhost:${boundPort}/watch`, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
        res.writeHead(200, { 'content-type': MIME['.svg'], 'cache-control': 'no-store' });
        res.end(svg);
        return;
      }
      if (pn.startsWith('/shared/')) { const f = safeJoin(SHARED, pn.slice(8)); if (f) return serveFile(res, f); }
      if (pn.startsWith('/docs/')) { const f = safeJoin(path.join(ROOT, 'docs'), pn.slice(6)); if (f) return serveFile(res, f); }
      const f = safeJoin(PUBLIC, pn.slice(1));
      if (f) return serveFile(res, f);
      res.writeHead(404); res.end('Not found');
    } catch (e) {
      res.writeHead(500); res.end(String(e.message));
    }
  });

  // ---------------------------------------------------------------- WebSocket
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, url));
  });

  wss.on('connection', (ws, req, url) => {
    const role = ROLES.includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'watch';
    // A test (or a proxy) may mark a connection as remote; this can only REDUCE rights.
    const local = isLoopback(req.socket.remoteAddress) && !req.headers['x-ciphercam-simulate-remote'];
    const c = { ws, role, local: local || allowRemoteControl, id: nextId++, alive: true };
    if (role !== 'watch' && !c.local) {
      ws.close(4003, 'Only /watch is available from other devices');
      return;
    }
    if (role === 'watch' && byRole('watch').length >= MAX_WATCHERS) {
      ws.close(4029, 'Too many watchers');
      return;
    }
    if (role === 'alice' || role === 'bob') {
      for (const old of byRole(role)) {
        send(old, encodeMessage({ t: T.ERROR, code: 'replaced', text: `A newer ${role} page connected; this one is now inactive.` }));
        clients.delete(old);
        old.ws.close(4000, 'replaced');
      }
    }
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data) => { onMessage(c, data).catch(() => {}); });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (!clients.has(c)) return;
      clients.delete(c);
      if (role === 'alice' || role === 'bob') event(`${role === 'alice' ? 'Alice' : 'Bob'} disconnected`, 'warn');
      broadcastState();
    });
    // Greet: current state, recent events, and the splash frame (so Eve can recover the keystream).
    send(c, encodeMessage({ t: T.STATE, state }));
    if (role === 'stage' || role === 'eve') for (const e of events) send(c, encodeMessage(e));
    if ((role === 'eve' || role === 'watch') && seq0) send(c, seq0);
    if (role === 'alice' || role === 'bob') {
      const other = role === 'alice' ? 'bob' : 'alice';
      event(`${role === 'alice' ? 'Alice' : 'Bob'} connected`, 'good');
      for (const o of byRole(other)) send(o, encodeMessage({ t: T.PEER_JOINED, role }));
      restart(`${role} connected`);
    } else {
      broadcastState();
    }
  });

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { try { c.ws.terminate(); } catch { /* ignore */ } continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* ignore */ }
    }
  }, 15000);

  boundPort = await listenWithFallback(server, port, host, portTries);

  return {
    server, wss, state, events, stats,
    get port() { return boundPort; },
    lanInfo,
    restart,
    applyPatch: (p) => applyPatch(sanitizePatch(p), 'api'),
    clientCount: () => clients.size,
    heap: () => process.memoryUsage().heapUsed,
    async close() {
      clearInterval(heartbeat);
      stopLoop();
      for (const c of clients) { try { c.ws.terminate(); } catch { /* ignore */ } }
      await new Promise((r) => wss.close(() => r()));
      await new Promise((r) => server.close(() => r()));
    },
  };
}
