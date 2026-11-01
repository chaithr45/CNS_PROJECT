// shared/frame.js — everything about turning a picture into the 19,200 bytes we encrypt.
//
// This file runs in BOTH the browser and Node.js. It uses only plain JavaScript maths
// (no canvas, no crypto, no DOM), so every result is byte-identical everywhere.
//
// Frame format used throughout CipherCam:
//   * 160 × 120 pixels, 1 byte per pixel (grayscale 0..255)  →  19,200 bytes.
//   * "Row-major" order = the normal order: row 0 left→right, then row 1, ...
//   * "Tile order" = the order we actually encrypt: the picture is cut into 4×4 tiles
//     (40 tiles across × 30 down = 1,200 tiles). Each tile is exactly 16 bytes,
//     which is exactly ONE AES block. So "one AES block = one 4×4 patch of the image".

export const W = 160;                 // frame width in pixels
export const H = 120;                 // frame height in pixels
export const TILE = 4;                // tile side (4×4 = 16 pixels = 16 bytes = 1 AES block)
export const TILES_X = W / TILE;      // 40 tiles across
export const TILES_Y = H / TILE;      // 30 tiles down
export const BLOCKS = TILES_X * TILES_Y; // 1,200 AES blocks per frame
export const FRAME_BYTES = W * H;     // 19,200 bytes per frame
export const SPLASH_FRAMES = 10;      // every session starts with 10 splash frames (1 s)

// ---------------------------------------------------------------------------
// 1. Area downscale: 640×480 RGBA camera image → 160×120 grayscale (floats)
// ---------------------------------------------------------------------------
// Each output pixel is the AVERAGE of a 4×4 group of input pixels. Averaging 16
// noisy camera pixels cancels most of the sensor noise. Brightness ("luma") uses
// the standard TV formula 0.299 R + 0.587 G + 0.114 B.
export function downscaleToLuma(rgba, srcW, srcH) {
  const fx = Math.floor(srcW / W);
  const fy = Math.floor(srcH / H);
  const out = new Float32Array(FRAME_BYTES);
  const n = fx * fy;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let dy = 0; dy < fy; dy++) {
        let i = ((y * fy + dy) * srcW + x * fx) * 4;
        for (let dx = 0; dx < fx; dx++, i += 4) {
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        }
      }
      out[y * W + x] = sum / n;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2 + 3. Smoothing over time (EMA) and posterize with hysteresis
// ---------------------------------------------------------------------------
// The output value for level k out of L levels, spread evenly over 0..255.
// L = 4 gives 0, 85, 170, 255.
export function levelValue(k, levels) {
  return Math.round((k * 255) / (levels - 1));
}

// Posterize ONE value. `prev` is the level this pixel had last frame (or -1).
// Hysteresis: the pixel keeps its old level unless the value has moved past the
// boundary of that level by more than `margin`. This stops pixels flickering
// between two levels when the brightness sits right on a boundary.
export function posterizeValue(x, prev, levels, margin) {
  const step = 255 / (levels - 1);
  let raw = Math.round(x / step);
  if (raw < 0) raw = 0;
  if (raw > levels - 1) raw = levels - 1;
  if (prev < 0 || prev === raw) return raw;
  const lower = (prev - 0.5) * step; // boundary below the old level
  const upper = (prev + 0.5) * step; // boundary above the old level
  if (x > upper + margin || x < lower - margin) return raw; // moved far enough: change
  return prev; // still close to the old level: keep it
}

// A small stateful pipeline: feed it luma frames, get posterized 8-bit frames back.
export function createPipeline() {
  let avg = null;        // per-pixel moving average
  let lvl = null;        // per-pixel current level (for hysteresis)
  let lastLevels = 0;
  return {
    reset() { avg = null; lvl = null; },
    process(luma, { levels = 4, margin = 6 } = {}) {
      if (!avg) { avg = Float32Array.from(luma); }
      else {
        // Exponential moving average: 60 % old picture + 40 % new picture.
        for (let i = 0; i < FRAME_BYTES; i++) avg[i] = 0.6 * avg[i] + 0.4 * luma[i];
      }
      if (!lvl || levels !== lastLevels) { lvl = new Int8Array(FRAME_BYTES).fill(-1); lastLevels = levels; }
      const out = new Uint8Array(FRAME_BYTES);
      for (let i = 0; i < FRAME_BYTES; i++) {
        const k = posterizeValue(avg[i], lvl[i], levels, margin);
        lvl[i] = k;
        out[i] = levelValue(k, levels);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Tile layout (row-major ↔ tile order)
// ---------------------------------------------------------------------------
// toTiles: byte (t*16 + r*4 + c) = pixel at column (tx*4 + c), row (ty*4 + r),
// where tile number t = ty*40 + tx. So bytes 0..15 are the top-left 4×4 patch.
export function toTiles(pixels) {
  const out = new Uint8Array(FRAME_BYTES);
  let o = 0;
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      for (let r = 0; r < TILE; r++) {
        const base = (ty * TILE + r) * W + tx * TILE;
        out[o++] = pixels[base];
        out[o++] = pixels[base + 1];
        out[o++] = pixels[base + 2];
        out[o++] = pixels[base + 3];
      }
    }
  }
  return out;
}

// fromTiles: the exact inverse. Only the first 19,200 bytes are used (anything after
// that, like a padding block or an authentication tag, is ignored).
export function fromTiles(bytes) {
  const out = new Uint8Array(FRAME_BYTES);
  let o = 0;
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      for (let r = 0; r < TILE; r++) {
        const base = (ty * TILE + r) * W + tx * TILE;
        out[base] = bytes[o++] | 0;
        out[base + 1] = bytes[o++] | 0;
        out[base + 2] = bytes[o++] | 0;
        out[base + 3] = bytes[o++] | 0;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leak meter: what % of the 1,200 blocks in a frame are an exact copy of another block?
// ---------------------------------------------------------------------------
// With a good mode (CBC/CTR/GCM) every ciphertext block looks random, so repeats
// basically never happen (≈ 0 %). With ECB, identical 4×4 patches of wall give
// identical ciphertext blocks, so the meter reads high.
export function leakPercent(bytes) {
  const counts = new Map();
  const n = Math.min(BLOCKS, Math.floor(bytes.length / 16));
  const keys = new Array(n);
  for (let b = 0; b < n; b++) {
    const o = b * 16;
    // Build a compact string key from the 16 bytes of the block.
    let k = '';
    for (let i = 0; i < 16; i++) k += String.fromCharCode(bytes[o + i]);
    keys[b] = k;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let dup = 0;
  for (let b = 0; b < n; b++) if (counts.get(keys[b]) > 1) dup++;
  return n ? (dup * 100) / n : 0;
}

// XOR two byte arrays (length of the shorter one).
export function xorBytes(a, b) {
  const n = Math.min(a.length, b.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] ^ b[i];
  return out;
}

// ---------------------------------------------------------------------------
// Hard-coded 5×7 bitmap font (no canvas text, so it is identical everywhere)
// ---------------------------------------------------------------------------
export const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

// Width in pixels of `text` drawn at `scale` (each glyph 5 wide + 1 gap).
export function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

// Draw `text` into a row-major 160×120 buffer with its top-left corner at (x0, y0).
export function drawText(buf, text, x0, y0, scale, value) {
  for (let ci = 0; ci < text.length; ci++) {
    const g = FONT[text[ci]] || FONT[' '];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = x0 + (ci * 6 + gx) * scale + sx;
            const y = y0 + gy * scale + sy;
            if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = value;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Splash test card — the public "Connecting…" screen every call starts with
// ---------------------------------------------------------------------------
// It is built from integer maths only, so Alice, Eve and the tests all produce the
// SAME 19,200 bytes. That is exactly what makes the keystream-recovery attack work:
// Eve knows this plaintext, so with nonce reuse she can compute the keystream.
let splashCache = null;
export function makeSplashFrame() {
  if (splashCache) return splashCache.slice();
  const f = new Uint8Array(FRAME_BYTES);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v;
      if (y < 16) {
        v = levelValue(Math.floor(x / 20) % 4, 4);                 // grey-level bars on top
      } else if (y >= 104) {
        v = levelValue(3 - (Math.floor(x / 20) % 4), 4);           // reversed bars at the bottom
      } else {
        const dx = x - 80, dy = y - 60, d2 = dx * dx + dy * dy;
        const ring = Math.floor(Math.sqrt(d2) / 8);
        v = ring % 2 === 0 ? 85 : 170;                             // concentric circles
        if ((x >> 3) % 2 === (y >> 3) % 2 && d2 > 48 * 48) v = 0;  // checker corners
      }
      f[y * W + x] = v;
    }
  }
  // Dark boxes behind the text, then white letters.
  for (let y = 30; y < 50; y++) for (let x = 20; x < 140; x++) f[y * W + x] = 0;
  for (let y = 64; y < 84; y++) for (let x = 14; x < 146; x++) f[y * W + x] = 0;
  drawText(f, 'CIPHERCAM', Math.floor((W - textWidth('CIPHERCAM', 2)) / 2), 33, 2, 255);
  drawText(f, 'CONNECTING', Math.floor((W - textWidth('CONNECTING', 2)) / 2), 67, 2, 255);
  splashCache = f;
  return f.slice();
}

// ---------------------------------------------------------------------------
// Synthetic scene — a deterministic animated "person in a room" (no camera needed)
// ---------------------------------------------------------------------------
// A light wall with a gradient, a window, a desk, and a dark head-and-shoulders
// silhouette that sways and sometimes waves. `away: true` makes the person walk out
// of the frame (used by the replay / "CCTV loop" step).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  let t = (wx * vx + wy * vy) / (vx * vx + vy * vy);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

export function createSyntheticScene({ noise = 4 } = {}) {
  let offset = 0;        // how far the person has walked to the right (0 = in frame)
  let lastT = null;
  let frameNo = 0;
  // Pre-compute the static background once.
  const bg = new Float32Array(FRAME_BYTES);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 228 - (x / W) * 52 - (y / H) * 10;        // wall: uneven lighting, brighter on the left
      if (x >= 10 && x < 50 && y >= 10 && y < 52) {     // window
        v = 250;
        if (x < 12 || x >= 48 || y < 12 || y >= 50 || (x >= 29 && x < 31) || (y >= 30 && y < 32)) v = 95;
      }
      if (y >= 100) v = 110;                            // desk top
      if (y >= 100 && y < 103) v = 70;                  // desk edge
      bg[y * W + x] = v;
    }
  }
  return {
    get away() { return offset > 0; },
    // Render the scene at time tMs (milliseconds). Returns luma floats (160×120).
    render(tMs, { away = false, wave = false } = {}) {
      const dt = lastT === null ? 0 : Math.max(0, Math.min(200, tMs - lastT));
      lastT = tMs;
      // Walk out (≈1.3 s) or back in, smoothly.
      const target = away ? 130 : 0;
      const speed = 0.1 * dt; // pixels per ms
      if (offset < target) offset = Math.min(target, offset + speed);
      else if (offset > target) offset = Math.max(target, offset - speed);

      const out = new Float32Array(FRAME_BYTES);
      out.set(bg);
      const sway = 6 * Math.sin((2 * Math.PI * tMs) / 4000);
      const cx = 98 + sway + offset;  // centre of the person
      const headY = 44;
      // The arm waves for 2 s every 7 s, or all the time when `wave` is on.
      const waving = wave || (tMs % 7000) < 2000;
      const ang = (-Math.PI / 2) + 0.6 * Math.sin((2 * Math.PI * tMs) / 600);
      const sx = cx + 26, sy = 76;                       // shoulder joint
      const ex = sx + 14, ey = sy - 20;                   // elbow
      const hx = ex + 18 * Math.cos(ang), hy = ey + 18 * Math.sin(ang); // hand
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx;
          let v = -1;
          // Body: a rounded trapezoid from the shoulders down past the desk.
          if (y >= 68) {
            const half = 30 + Math.min(10, (y - 68) * 0.6);
            const top = y - 68 < 8 ? Math.sqrt(Math.max(0, 64 - (8 - (y - 68)) ** 2)) / 8 : 1;
            if (Math.abs(dx) < half * (0.75 + 0.25 * top)) v = 28;
          }
          // Neck.
          if (y >= 56 && y < 70 && Math.abs(dx) < 7) v = 50;
          // Head (an ellipse).
          const hdx = dx / 15, hdy = (y - headY) / 18;
          if (hdx * hdx + hdy * hdy < 1) v = 52;
          // Waving arm (a thick line: upper arm + forearm).
          if (waving && (distToSegment(x, y, sx, sy, ex, ey) < 5 || distToSegment(x, y, ex, ey, hx, hy) < 4.5)) v = 34;
          if (v >= 0) out[y * W + x] = v;
        }
      }
      // A little deterministic sensor noise, like a real camera.
      if (noise > 0) {
        const rnd = mulberry32(0xC1F3 + frameNo * 7919);
        for (let i = 0; i < FRAME_BYTES; i++) {
          const g = (rnd() + rnd() + rnd() - 1.5) * 2; // ≈ normal, σ ≈ 1
          out[i] += g * noise;
        }
      }
      frameNo++;
      return out;
    },
  };
}

// Convenience used by tests and the benchmark: N posterized synthetic frames.
export function syntheticFrames(count, { levels = 4, margin = 6, fps = 10, away = false } = {}) {
  const scene = createSyntheticScene();
  const pipe = createPipeline();
  const frames = [];
  for (let i = 0; i < count; i++) frames.push(pipe.process(scene.render((i * 1000) / fps, { away }), { levels, margin }));
  return frames;
}
