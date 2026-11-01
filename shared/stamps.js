// shared/stamps.js — the shapes Eve "stamps" onto Bob's video with the bit-flip attack.
//
// Each stamp is a 19,200-byte XOR mask in TILE order (the same order as the ciphertext):
// 0xFF where Eve flips every bit of the ciphertext byte, 0x00 where she leaves it alone.
// Drawn with pure maths (no canvas), so the browser preview and the Node relay produce
// exactly the same mask, and the tests can check the result byte-for-byte.

import { W, H, FRAME_BYTES, toTiles, drawText, textWidth } from './frame.js';

export const STAMPS = {
  star: '★ Star',
  hacked: 'HACKED',
  smiley: '☺ Smiley',
};

// Is point (px, py) inside the polygon `pts` ([[x, y], ...])? (ray casting)
function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Row-major 160×120 picture of the stamp: 255 = flip, 0 = leave alone.
export function stampPixels(name) {
  const p = new Uint8Array(FRAME_BYTES);
  if (name === 'hacked') {
    const s = 4;
    drawText(p, 'HACKED', Math.floor((W - textWidth('HACKED', s)) / 2), Math.floor((H - 7 * s) / 2), s, 255);
    return p;
  }
  if (name === 'smiley') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - 80, dy = y - 60, d = Math.sqrt(dx * dx + dy * dy);
        let on = d > 40 && d < 48;                                                 // face outline
        if ((x - 66) ** 2 + (y - 48) ** 2 < 36 || (x - 94) ** 2 + (y - 48) ** 2 < 36) on = true; // eyes
        if (d > 22 && d < 29 && dy > 6) on = true;                                // smile
        if (on) p[y * W + x] = 255;
      }
    }
    return p;
  }
  // Default: a big five-pointed star in the middle of the frame.
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 52 : 21;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([80 + r * Math.cos(a), 62 + r * Math.sin(a)]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inPolygon(x + 0.5, y + 0.5, pts)) p[y * W + x] = 255;
  return p;
}

// The XOR mask in tile order, ready to be applied to the ciphertext.
export function makeStampMask(name) {
  return toTiles(stampPixels(name in STAMPS ? name : 'star'));
}
