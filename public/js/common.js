// public/js/common.js — small helpers shared by every page.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const params = new URLSearchParams(location.search);
export const isEmbed = params.get('embed') === '1';

// Call first on every page.
//   needsCrypto: the page uses Web Crypto / the camera, which only work on https:// or localhost.
export function initPage({ needsCrypto = false } = {}) {
  if (isEmbed) {
    document.body.classList.add('embed');
    // Inside the Stage: send key presses up to the Stage, so shortcuts work after a click here.
    document.addEventListener('keydown', (e) => {
      try { window.parent.postMessage({ type: 'stage-key', key: e.key }, location.origin); } catch { /* not in a Stage */ }
    });
  }
  if (needsCrypto && !(window.isSecureContext && globalThis.crypto && crypto.subtle)) {
    const b = document.createElement('div');
    b.className = 'insecure-banner';
    b.textContent = `Open this page via http://localhost:${location.port || 80}${location.pathname} on the presenter laptop (Web Crypto and the camera need a secure context).`;
    document.body.prepend(b);
    return false;
  }
  return true;
}

// Plug the aes-js library (loaded with a classic <script> tag) into shared/ecb.js.
export async function setupAesJs() {
  const { setAesJs } = await import('/shared/ecb.js');
  if (window.aesjs) setAesJs(window.aesjs);
}

let toastTimer = null;
export function toast(text, ms = 4000) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// A 160×120 canvas "screen" we can paint grayscale or colour frames onto.
export function createScreen(canvas) {
  canvas.width = 160; canvas.height = 120;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(160, 120);
  const d = img.data;
  return {
    canvas,
    gray(pixels) {
      for (let i = 0, j = 0; i < 19200; i++, j += 4) { const v = pixels[i]; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    },
    // fn(i) → [r, g, b] for pixel i (row-major)
    rgb(fill) { fill(d); ctx.putImageData(img, 0, 0); },
    clear(v = 0) { for (let j = 0; j < d.length; j += 4) { d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; } ctx.putImageData(img, 0, 0); },
  };
}

// Out-of-band channel between same-origin pages on the laptop (like reading numbers aloud).
export function oobChannel() {
  try { return new BroadcastChannel('ciphercam-oob'); } catch { return { postMessage() {}, addEventListener() {} }; }
}

export function fmtMs(ms) { return `${Math.round(ms)} ms`; }
