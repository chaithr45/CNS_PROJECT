// public/js/eve-view.js — what the attacker sees. PASSIVE analysis only:
// Eve never has the key here, and this file uses NO Web Crypto at all (so it also runs on
// audience phones over plain http://, which is not a "secure context").
//
// Views:
//   raw        ciphertext bytes drawn as grey pixels (inverse tile layout)
//   blocks     every 16-byte block → a 4×4 swatch coloured by its first 3 bytes
//              (identical blocks get identical colours — the strongest ECB picture)
//   xor        C_now ⊕ C_prev: zero bytes black, non-zero white — motion appears
//   keystream  K = C₀ ⊕ splash, then show C ⊕ K for frames with the same IV
// Plus: leak meter, nonce-reuse detector, and the MITM view ("EVE HAS THE KEY").

import { fromTiles, toTiles, makeSplashFrame, leakPercent, FRAME_BYTES, TILES_X, TILES_Y, W } from '/shared/frame.js';

export const VIEW_LABELS = {
  raw: 'Raw ciphertext',
  blocks: 'Block colours',
  xor: 'XOR with previous frame',
  keystream: 'Keystream recovery',
};

export const VIEW_EXPLAIN = {
  raw: 'Each ciphertext byte is drawn as one grey pixel. Good encryption looks like pure noise.',
  blocks: 'Each 16-byte block is painted one colour, taken from its first 3 bytes. Identical ciphertext blocks get identical colours — so if the mode leaks patterns, shapes appear.',
  xor: 'Eve XORs this frame\'s ciphertext with the previous one. Where the bytes are equal she paints black, where they differ white. With a reused nonce, only moving parts light up.',
  keystream: 'Eve stores frame #0 (the public "Connecting…" test card) and computes K = C₀ ⊕ splash. If the same nonce is used again, C ⊕ K is the live picture — no key needed.',
};

export function createEveView({ canvas, root }) {
  canvas.width = 160; canvas.height = 120;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(160, 120);
  const d = img.data;
  const splashTiles = toTiles(makeSplashFrame());
  const q = (sel) => root.querySelector(sel);
  const each = (sel, fn) => root.querySelectorAll(sel).forEach(fn);

  let state = null;
  let sess = null;     // { sid, c0, iv0, ivs: Map(iv → first seq), prev, K }
  const stats = {
    sid: null, mode: null, lastSeq: -1, frames: 0, leak: 0,
    nonceReuse: null,           // { seq, firstSeq } when the current frame reuses an IV
    keystream: null,            // 'recovered' | 'no-reuse' | 'no-iv' | 'waiting' | null
    mitmFrames: 0, lastPlainAt: 0, eveHasKey: false,
    view: 'raw',
  };
  let reuseAt = 0;

  function newSession(sid) {
    sess = { sid, c0: null, iv0: null, ivs: new Map(), prev: null, K: null };
    stats.sid = sid; stats.frames = 0; stats.nonceReuse = null; stats.lastSeq = -1;
  }

  function putGray(px) {
    for (let i = 0, j = 0; i < FRAME_BYTES; i++, j += 4) { const v = px[i]; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function putBlocks(ct) {
    for (let b = 0; b < TILES_X * TILES_Y; b++) {
      const r = ct[b * 16], g = ct[b * 16 + 1], bl = ct[b * 16 + 2];
      const tx = b % TILES_X, ty = Math.floor(b / TILES_X);
      for (let y = 0; y < 4; y++) {
        let j = ((ty * 4 + y) * W + tx * 4) * 4;
        for (let x = 0; x < 4; x++, j += 4) { d[j] = r; d[j + 1] = g; d[j + 2] = bl; d[j + 3] = 255; }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function setOverlay() {
    const view = state?.eveView || 'raw';
    stats.view = view;
    const now = Date.now();
    const showPlain = stats.eveHasKey;
    q('[data-eve="viewname"]') && (q('[data-eve="viewname"]').textContent = showPlain ? '🔓 Decrypted by Eve (MITM)' : VIEW_LABELS[view]);
    const reuse = q('[data-eve="reuse"]');
    if (reuse) {
      const on = stats.nonceReuse && now - reuseAt < 1500;
      reuse.classList.toggle('hidden', !on);
      if (on) reuse.textContent = `⚠ NONCE REUSED (same IV as frame #${stats.nonceReuse.firstSeq})`;
    }
    const msg = q('[data-eve="msg"]');
    if (msg) {
      let text = '';
      if (!showPlain && view === 'keystream') {
        if (stats.keystream === 'no-reuse') text = 'No reuse detected — attack fails';
        else if (stats.keystream === 'no-iv') text = 'This mode has no IV / nonce — nothing to reuse';
        else if (stats.keystream === 'waiting') text = 'Waiting for frame #0 (the splash card)…';
      }
      if (!stats.frames && !showPlain) text = 'Listening on the network…';
      msg.textContent = text;
      msg.classList.toggle('hidden', !text);
    }
    const ks = q('[data-eve="ksok"]');
    if (ks) ks.classList.toggle('hidden', !(view === 'keystream' && stats.keystream === 'recovered' && !showPlain));
    const mitm = q('[data-eve="mitm"]');
    if (mitm) mitm.classList.toggle('hidden', !showPlain);
    each('[data-eve="leak"]', (el) => { el.textContent = `${stats.leak.toFixed(0)}%`; });
    each('[data-eve="leakbar"]', (bar) => { bar.style.width = `${Math.min(100, stats.leak)}%`; bar.parentElement.classList.toggle('high', stats.leak > 20); });
    each('[data-eve="leakbox"]', (hl) => hl.classList.toggle('leak-highlight', !!state?.leakHighlight));
  }

  function onFrame(header, payload) {
    if (!sess || sess.sid !== header.sid) newSession(header.sid);
    const ct = payload.subarray(0, FRAME_BYTES);
    stats.mode = header.mode;
    stats.frames++;
    stats.lastSeq = header.seq;
    stats.leak = leakPercent(ct);

    // Nonce-reuse detector: have we seen this IV before in this session?
    stats.nonceReuse = null;
    if (header.iv) {
      if (sess.ivs.has(header.iv) && sess.ivs.get(header.iv) !== header.seq) {
        stats.nonceReuse = { seq: header.seq, firstSeq: sess.ivs.get(header.iv) };
        reuseAt = Date.now();
      } else if (!sess.ivs.has(header.iv)) {
        sess.ivs.set(header.iv, header.seq);
        if (sess.ivs.size > 5000) sess.ivs.clear();
      }
    }
    // Keystream recovery: K = C₀ ⊕ splash (Eve knows the splash card).
    if (header.seq === 0) {
      sess.c0 = ct.slice();
      sess.iv0 = header.iv;
      sess.K = new Uint8Array(FRAME_BYTES);
      for (let i = 0; i < FRAME_BYTES; i++) sess.K[i] = sess.c0[i] ^ splashTiles[i];
    }
    if (!header.iv) stats.keystream = 'no-iv';
    else if (!sess.K) stats.keystream = 'waiting';
    else stats.keystream = header.iv === sess.iv0 ? 'recovered' : 'no-reuse';

    const view = state?.eveView || 'raw';
    if (!stats.eveHasKey) {
      if (view === 'blocks') putBlocks(ct);
      else if (view === 'xor') {
        const x = new Uint8Array(FRAME_BYTES);
        if (sess.prev) for (let i = 0; i < FRAME_BYTES; i++) x[i] = sess.prev[i] !== ct[i] ? 255 : 0;
        putGray(fromTiles(x));
      } else if (view === 'keystream' && sess.K && header.iv) {
        const p = new Uint8Array(FRAME_BYTES);
        for (let i = 0; i < FRAME_BYTES; i++) p[i] = ct[i] ^ sess.K[i];
        putGray(fromTiles(p));
      } else putGray(fromTiles(ct));
    }
    sess.prev = ct.slice();
    setOverlay();
  }

  function onPlain(header, payload) {
    stats.mitmFrames++;
    stats.lastPlainAt = Date.now();
    stats.eveHasKey = !!state?.mitmActive;
    if (stats.eveHasKey) putGray(payload.subarray(0, FRAME_BYTES));
    setOverlay();
  }

  setInterval(() => {
    // Stop showing the MITM view if no decrypted frames arrived for a while.
    stats.eveHasKey = !!state?.mitmActive && Date.now() - stats.lastPlainAt < 1500;
    setOverlay();
  }, 400);

  putGray(new Uint8Array(FRAME_BYTES));
  setOverlay();

  return {
    stats,
    setState(s) { state = s; if (!s.mitmActive) stats.eveHasKey = false; setOverlay(); },
    handle(msg) {
      const h = msg.header;
      if (h.t === 'frame') onFrame(h, msg.payload);
      else if (h.t === 'eve-plain') onPlain(h, msg.payload);
      else if (h.t === 'state') this.setState(h.state);
    },
  };
}

// The HTML for one Eve screen (used by eve.html, watch.html).
export const EVE_SCREEN_HTML = `
  <canvas aria-label="What the attacker sees"></canvas>
  <div class="corner"><span class="badge" data-eve="viewname">Raw ciphertext</span><span class="badge ok hidden" data-eve="ksok">🔓 Keystream recovered: K = C₀ ⊕ splash</span></div>
  <div class="banner-warn hidden blink" data-eve="reuse"></div>
  <div class="overlay-msg hidden" data-eve="msg"></div>
  <div class="banner-red hidden" data-eve="mitm">🔓 EVE HAS THE KEY — she decrypts every frame</div>`;
