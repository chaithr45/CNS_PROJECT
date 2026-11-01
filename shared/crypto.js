// shared/crypto.js — all the real cryptography in CipherCam.
//
// Runs in BOTH the browser and Node.js. It only uses `globalThis.crypto.subtle`
// (the Web Crypto API) and `globalThis.crypto.getRandomValues`, which both have.
// Every crypto line has a plain-English comment so you can read it aloud.

import { ecbEncrypt, ecbDecrypt } from './ecb.js';

const subtle = () => globalThis.crypto.subtle;          // looked up lazily, never at import time
const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// The seven modes. `tagLen` = bytes of authentication tag appended to the payload.
// ---------------------------------------------------------------------------
export const MODES = {
  'plain':     { label: 'No encryption',                   secure: false, integrity: false, tagLen: 0 },
  'ecb':       { label: 'AES-ECB',                         secure: false, integrity: false, tagLen: 0 },
  'cbc':       { label: 'AES-CBC (random IV)',             secure: false, integrity: false, tagLen: 0 },
  'ctr':       { label: 'AES-CTR (random nonce)',          secure: false, integrity: false, tagLen: 0 },
  'ctr-reuse': { label: 'AES-CTR — BUG: nonce reused',     secure: false, integrity: false, tagLen: 0 },
  'ctr-hmac':  { label: 'CTR + HMAC (Encrypt-then-MAC)',   secure: true,  integrity: true,  tagLen: 32 },
  'gcm':       { label: 'AES-GCM (secure)',                secure: true,  integrity: true,  tagLen: 16 },
};
export const MODE_IDS = Object.keys(MODES);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b); // cryptographically secure random bytes
  return b;
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromBase64(str) {
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

export function toHex(bytes) {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}

export function concatBytes(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Compare two byte arrays like strings: negative if a < b, 0 if equal, positive if a > b.
export function compareBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

// ---------------------------------------------------------------------------
// ECDH P-256 key exchange (Unit 3)
// ---------------------------------------------------------------------------
// Each side makes a fresh key pair: a private number only it knows, and a public
// point on the P-256 elliptic curve that it can send to anyone.
export async function generateKeyPair() {
  const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  // Export the public key in "raw" form: 0x04 ‖ X (32 bytes) ‖ Y (32 bytes) = 65 bytes.
  const pubRaw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, pubRaw };
}

// Turn the peer's 65 raw bytes back into a key object Web Crypto can use.
export async function importPublicKey(pubRaw) {
  return subtle().importKey('raw', pubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

// HKDF-SHA256: stretch the 32-byte ECDH secret into all the separate keys we need.
// salt = SHA-256(session id) so every session gets different keys,
// info = a fixed label so these keys can't be confused with keys for anything else.
export async function hkdf(ikm, salt, info, lengthBytes) {
  const base = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, base, lengthBytes * 8);
  return new Uint8Array(bits);
}

export async function sha256(bytes) {
  return new Uint8Array(await subtle().digest('SHA-256', bytes));
}

export const HKDF_INFO = 'CipherCam v1 keys';

// Import 16 raw bytes as AES keys for each Web Crypto algorithm, plus the HMAC key.
// (Web Crypto ties every key object to ONE algorithm, so we import the same bytes 3 times.)
export async function importSessionKeys(raw) {
  const { aesKey, macKey, nonceSalt } = raw;
  const [cbc, ctr, gcm, hmac] = await Promise.all([
    subtle().importKey('raw', aesKey, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']),
    subtle().importKey('raw', aesKey, { name: 'AES-CTR' }, false, ['encrypt', 'decrypt']),
    subtle().importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
    subtle().importKey('raw', macKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  ]);
  return { aesKey, macKey, nonceSalt, cbc, ctr, gcm, hmac };
}

// Full key derivation for one session:
//   shared = ECDH(myPrivate, peerPublic)            — both sides get the SAME 32 bytes
//   okm    = HKDF-SHA256(shared, SHA-256(sid), "CipherCam v1 keys", 52 bytes)
//   aesKey = okm[0..16), macKey = okm[16..48), nonceSalt = okm[48..52)
export async function deriveSessionKeys(privateKey, peerPubRaw, sid) {
  const peer = await importPublicKey(peerPubRaw);
  // ECDH: combine my private key with their public key → a shared secret only we two know.
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256));
  const salt = await sha256(enc.encode(sid));
  const okm = await hkdf(shared, salt, HKDF_INFO, 52);
  const raw = {
    aesKey: okm.slice(0, 16),     // AES-128 key (used by ECB, CBC, CTR and GCM)
    macKey: okm.slice(16, 48),    // 256-bit HMAC key (used by ctr-hmac)
    nonceSalt: okm.slice(48, 52), // 4 secret bytes at the front of every GCM nonce
  };
  return importSessionKeys(raw);
}

// ---------------------------------------------------------------------------
// Safety number (defeats the man-in-the-middle, if humans compare it)
// ---------------------------------------------------------------------------
// SHA-256("CipherCam safety" ‖ smaller public key ‖ larger public key). Sorting the two
// keys means Alice and Bob get the same number no matter who computes it. We show the
// first 6 bytes as 12 decimal digits in groups of 4, e.g. "0412 9937 1180".
export async function safetyNumber(pubA, pubB) {
  const [lo, hi] = compareBytes(pubA, pubB) <= 0 ? [pubA, pubB] : [pubB, pubA];
  const h = await sha256(concatBytes(enc.encode('CipherCam safety'), lo, hi));
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + h[i];      // 48-bit number (exact in JS)
  const digits = String(n % 1e12).padStart(12, '0');
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

// ---------------------------------------------------------------------------
// GCM nonce = nonceSalt (4 bytes) ‖ seq (8 bytes, big-endian) = 12 bytes = 96 bits.
// Because seq goes up by one every frame, the nonce is never repeated in a session.
// ---------------------------------------------------------------------------
export function gcmNonce(nonceSalt, seq) {
  const n = new Uint8Array(12);
  n.set(nonceSalt, 0);
  const view = new DataView(n.buffer);
  view.setUint32(4, Math.floor(seq / 2 ** 32));
  view.setUint32(8, seq >>> 0);
  return n;
}

// ---------------------------------------------------------------------------
// Pick the IV / nonce a frame will use (BEFORE the header is built, because the header
// carries it and some modes authenticate the header).
// ---------------------------------------------------------------------------
export function chooseIv(mode, keys, seq, session) {
  switch (mode) {
    case 'plain':
    case 'ecb':
      return null;                                   // no IV at all
    case 'cbc':
    case 'ctr':
    case 'ctr-hmac':
      return randomBytes(16);                        // fresh random 16 bytes every frame
    case 'ctr-reuse':
      // THE BUG: the same counter block for every frame of the session.
      if (!session.reuseIv) session.reuseIv = randomBytes(16);
      return session.reuseIv;
    case 'gcm':
      return gcmNonce(keys.nonceSalt, seq);          // salt ‖ frame counter
    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

// ---------------------------------------------------------------------------
// Encrypt one frame's 19,200 tile-ordered bytes. Returns payload = ciphertext ‖ tag.
// `headerBytes` = the exact frame header bytes (authenticated by ctr-hmac and gcm).
// ---------------------------------------------------------------------------
export async function encryptPayload(mode, keys, iv, plain, headerBytes) {
  switch (mode) {
    case 'plain':
      return plain.slice();                          // no encryption: what you send is what Eve sees

    case 'ecb':
      // Each 16-byte block (one 4×4 tile) is encrypted separately with the same key.
      return ecbEncrypt(keys.aesKey, plain);

    case 'cbc':
      // CBC: each block is XORed with the previous ciphertext block before encryption,
      // starting with a random IV. Web Crypto adds 16 bytes of PKCS#7 padding at the end.
      return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, keys.cbc, plain));

    case 'ctr':
    case 'ctr-reuse':
      // CTR: AES encrypts counter, counter+1, ... to make a "keystream", then
      // ciphertext = plaintext XOR keystream. length: 64 = the low 64 bits are the counter.
      return new Uint8Array(await subtle().encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, keys.ctr, plain));

    case 'ctr-hmac': {
      // Encrypt-then-MAC: first encrypt with CTR ...
      const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, keys.ctr, plain));
      // ... then compute HMAC-SHA256 over (header ‖ ciphertext) with the separate MAC key.
      const tag = new Uint8Array(await subtle().sign('HMAC', keys.hmac, concatBytes(headerBytes, ct)));
      return concatBytes(ct, tag);                   // 19,200 + 32 bytes
    }

    case 'gcm':
      // AES-GCM = CTR encryption + a built-in 128-bit authentication tag (AEAD).
      // additionalData = the header: not secret, but any change to it is detected.
      return new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes, tagLength: 128 }, keys.gcm, plain));

    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

// Decrypt. Throws an Error with .kind = 'tamper' if an authentication tag fails,
// or 'decrypt' for any other decryption failure (e.g. bad CBC padding).
export async function decryptPayload(mode, keys, iv, payload, headerBytes) {
  try {
    switch (mode) {
      case 'plain':
        return payload.slice(0, 19200);
      case 'ecb':
        return ecbDecrypt(keys.aesKey, payload.subarray(0, payload.length - (payload.length % 16)));
      case 'cbc':
        return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, keys.cbc, payload));
      case 'ctr':
      case 'ctr-reuse':
        return new Uint8Array(await subtle().decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, keys.ctr, payload));
      case 'ctr-hmac': {
        const ct = payload.subarray(0, payload.length - 32);
        const tag = payload.subarray(payload.length - 32);
        // Check the tag FIRST. If header or ciphertext changed by even one bit, this fails.
        const ok = await subtle().verify('HMAC', keys.hmac, tag, concatBytes(headerBytes, ct));
        if (!ok) { const e = new Error('tag mismatch'); e.kind = 'tamper'; throw e; }
        // Only decrypt data we have proven is authentic.
        return new Uint8Array(await subtle().decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, keys.ctr, ct));
      }
      case 'gcm':
        // Web Crypto checks the GCM tag and throws if anything was tampered with.
        try {
          return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: headerBytes, tagLength: 128 }, keys.gcm, payload));
        } catch (err) {
          const e = new Error('tag mismatch'); e.kind = 'tamper'; e.cause = err; throw e;
        }
      default: {
        const e = new Error(`unknown mode ${mode}`); e.kind = 'decrypt'; throw e;
      }
    }
  } catch (err) {
    if (!err.kind) err.kind = 'decrypt';
    throw err;
  }
}
