// shared/ecb.js — AES-ECB, using the small `aes-js` library.
//
// Web Crypto deliberately does NOT offer ECB, because ECB is insecure for almost
// everything. We need it anyway, to SHOW why it is insecure. So the aes-js library is
// "injected" here:
//   * the browser loads /vendor/aes-js/index.js with a classic <script> tag and calls
//     setAesJs(window.aesjs);
//   * Node calls setAesJs(createRequire(import.meta.url)('aes-js')).
// This keeps this file free of any browser-only or Node-only code.

let aesjs = null;

export function setAesJs(lib) {
  aesjs = lib;
}

export function hasAesJs() {
  return !!aesjs;
}

function need() {
  if (!aesjs) throw new Error('aes-js not loaded: call setAesJs() first');
  return aesjs;
}

// ECB = "Electronic Code Book": every 16-byte block is encrypted on its own, with the
// same key, and nothing else mixed in. Same input block → same output block. Always.
export function ecbEncrypt(keyBytes, data) {
  const ecb = new (need().ModeOfOperation.ecb)(keyBytes);
  return Uint8Array.from(ecb.encrypt(data)); // data length must be a multiple of 16
}

export function ecbDecrypt(keyBytes, data) {
  const ecb = new (need().ModeOfOperation.ecb)(keyBytes);
  return Uint8Array.from(ecb.decrypt(data));
}
