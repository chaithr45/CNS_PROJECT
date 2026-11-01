// test/frame.test.js — the video pipeline: tiles, posterize, splash card, synthetic scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { bytesEqual } from './helpers.js';
import {
  W, H, FRAME_BYTES, BLOCKS, toTiles, fromTiles, posterizeValue, levelValue, createPipeline,
  makeSplashFrame, createSyntheticScene, syntheticFrames, downscaleToLuma, leakPercent, xorBytes,
} from '../shared/frame.js';
import { makeStampMask, stampPixels, STAMPS } from '../shared/stamps.js';

test('frame constants: 160×120, 1200 blocks, 19200 bytes', () => {
  assert.equal(W * H, FRAME_BYTES);
  assert.equal(BLOCKS * 16, FRAME_BYTES);
});

test('tile layout round-trips exactly', () => {
  const px = new Uint8Array(FRAME_BYTES);
  for (let i = 0; i < FRAME_BYTES; i++) px[i] = (i * 7 + (i >> 8)) & 255;
  assert.ok(bytesEqual(fromTiles(toTiles(px)), px));
});

test('tile layout: block 0 is the top-left 4×4 tile, block 1 the tile to its right', () => {
  const px = new Uint8Array(FRAME_BYTES);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = (Math.floor(x / 4) + Math.floor(y / 4) * 40) & 255;
  const t = toTiles(px);
  for (let b = 0; b < 3; b++) for (let i = 0; i < 16; i++) assert.equal(t[b * 16 + i], b);
  // tile 40 = first tile of the second tile-row
  for (let i = 0; i < 16; i++) assert.equal(t[40 * 16 + i], 40);
});

test('posterize: level values spread over 0..255', () => {
  assert.deepEqual([0, 1, 2, 3].map((k) => levelValue(k, 4)), [0, 85, 170, 255]);
  assert.deepEqual([0, 1].map((k) => levelValue(k, 2)), [0, 255]);
});

test('posterize with hysteresis keeps the old level near a boundary', () => {
  // L=4: boundary between level 1 (85) and level 2 (170) is 127.5. Margin 6.
  assert.equal(posterizeValue(130, -1, 4, 6), 2);      // no history: plain rounding
  assert.equal(posterizeValue(130, 1, 4, 6), 1);       // was level 1, only 2.5 past boundary → stay
  assert.equal(posterizeValue(133, 1, 4, 6), 1);       // 5.5 past → stay
  assert.equal(posterizeValue(134, 1, 4, 6), 2);       // 6.5 past → switch
});

test('posterize hysteresis: a value 5.5 below the boundary stays, 6.5 below switches', () => {
  assert.equal(posterizeValue(122, 2, 4, 6), 2);
  assert.equal(posterizeValue(121, 2, 4, 6), 1);
});

test('pipeline: EMA + hysteresis stop flicker on a noisy constant pixel', () => {
  const pipe = createPipeline();
  let changes = 0, last = -1;
  for (let i = 0; i < 100; i++) {
    const luma = new Float32Array(FRAME_BYTES).fill(127.5 + (i % 2 ? 4 : -4)); // noise across the boundary
    const out = pipe.process(luma, { levels: 4, margin: 6 });
    if (last >= 0 && out[0] !== last) changes++;
    last = out[0];
  }
  assert.equal(changes, 0);
});

test('area downscale averages each 4×4 group and uses luma weights', () => {
  const rgba = new Uint8ClampedArray(640 * 480 * 4);
  for (let i = 0; i < 640 * 480; i++) { rgba[i * 4] = 255; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = 255; }
  const l = downscaleToLuma(rgba, 640, 480);
  assert.equal(l.length, FRAME_BYTES);
  assert.ok(Math.abs(l[0] - 0.299 * 255) < 1e-3);
  // A checkerboard of black and white pixels averages to mid-grey.
  for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) {
    const v = (x + y) % 2 ? 255 : 0, i = (y * 640 + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  const g = downscaleToLuma(rgba, 640, 480);
  assert.ok(Math.abs(g[500] - 127.5) < 0.01);
});

test('splash frame is deterministic (same bytes every time, known hash)', () => {
  const a = makeSplashFrame(), b = makeSplashFrame();
  assert.equal(a.length, FRAME_BYTES);
  assert.ok(bytesEqual(a, b));
  a[0] ^= 1; // mutating a copy must not change the cache
  assert.ok(bytesEqual(makeSplashFrame(), b));
  const h = crypto.createHash('sha256').update(b).digest('hex');
  const V = JSON.parse(fs.readFileSync(new URL('./vectors.json', import.meta.url)));
  assert.equal(h, V.splash.sha256, 'splash matches the recorded hash in test/vectors.json');
});

test('synthetic scene is deterministic and the person can leave the room', () => {
  const a = syntheticFrames(12), b = syntheticFrames(12);
  assert.ok(bytesEqual(a[11], b[11]));
  const scene = createSyntheticScene({ noise: 0 });
  const present = scene.render(0);
  let t = 0, gone;
  for (let i = 0; i < 30; i++) { t += 100; gone = scene.render(t, { away: true }); }
  // The person (dark pixels, < 70) is in the frame at first and gone afterwards.
  const dark = (f) => f.filter((v) => v < 64).length;
  assert.ok(dark(present) > 2000, `person visible: ${dark(present)}`);
  assert.ok(dark(gone) < 50, `person gone: ${dark(gone)}`);
});

test('leak meter: plaintext synthetic frame has many repeated blocks; random bytes have none', () => {
  const f = syntheticFrames(20)[19];
  assert.ok(leakPercent(toTiles(f)) > 50);
  const r = crypto.randomBytes(FRAME_BYTES);
  assert.equal(leakPercent(r), 0);
});

test('xorBytes', () => {
  assert.deepEqual([...xorBytes(Uint8Array.of(1, 2, 255), Uint8Array.of(1, 3, 15))], [0, 1, 240]);
});

test('stamp masks are 0x00/0xFF, tile-ordered, and non-trivial', () => {
  for (const name of Object.keys(STAMPS)) {
    const m = makeStampMask(name);
    assert.equal(m.length, FRAME_BYTES);
    const on = m.filter((v) => v === 255).length;
    assert.ok(on > 500 && on < 8000, `${name}: ${on} pixels`);
    assert.ok(m.every((v) => v === 0 || v === 255));
    assert.ok(bytesEqual(fromTiles(m), stampPixels(name)));
  }
});
