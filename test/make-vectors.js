// test/make-vectors.js — generate known-answer test vectors with node:crypto (OpenSSL).
// OpenSSL is a completely independent implementation from Web Crypto-in-the-browser and
// from aes-js, so if all three agree on these bytes, our crypto is wired up correctly.
//   Run: npm run vectors   → writes test/vectors.json (used by npm test and /selftest)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSplashFrame } from '../shared/frame.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hex = (b) => Buffer.from(b).toString('hex');
const fixed = (n, start) => Buffer.from(Array.from({ length: n }, (_, i) => (start + i * 37) & 255));

const key = fixed(16, 11);
const macKey = fixed(32, 99);
const plaintext = fixed(64, 3);           // 4 AES blocks
const iv16 = fixed(16, 200);
const iv12 = fixed(12, 50);
const aad = Buffer.from('{"t":"frame","seq":7}');

function enc(alg, iv, opts = {}) {
  const c = crypto.createCipheriv(alg, key, iv, opts);
  if (opts.aad) c.setAAD(opts.aad);
  if (opts.noPad) c.setAutoPadding(false);
  const out = Buffer.concat([c.update(plaintext), c.final()]);
  return opts.aad ? Buffer.concat([out, c.getAuthTag()]) : out;
}

// HKDF + ECDH-free check of the key schedule (ikm is a fixed 32-byte "shared secret").
const ikm = fixed(32, 7);
const sid = 'test-session';
const salt = crypto.createHash('sha256').update(sid).digest();
const okm = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('CipherCam v1 keys'), 52));

const vectors = {
  generatedBy: 'node:crypto (OpenSSL) — test/make-vectors.js',
  fips197: {
    note: 'FIPS-197 Appendix C.1 (AES-128)',
    key: '000102030405060708090a0b0c0d0e0f',
    plaintext: '00112233445566778899aabbccddeeff',
    ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a',
  },
  common: { key: hex(key), macKey: hex(macKey), plaintext: hex(plaintext), iv16: hex(iv16), iv12: hex(iv12), aad: hex(aad) },
  ecb: { ciphertext: hex(enc('aes-128-ecb', null, { noPad: true })) },
  cbc: { ciphertext: hex(enc('aes-128-cbc', iv16)) },            // with PKCS#7 padding, like Web Crypto
  ctr: { ciphertext: hex(enc('aes-128-ctr', iv16)) },
  gcm: { ciphertextAndTag: hex(enc('aes-128-gcm', iv12, { aad, authTagLength: 16 })) },
  hmac: { tag: hex(crypto.createHmac('sha256', macKey).update(plaintext).digest()) },
  hkdf: { ikm: hex(ikm), sid, info: 'CipherCam v1 keys', okm: hex(okm) },
  // The splash card must be byte-identical everywhere (Eve rebuilds it for keystream recovery).
  splash: { sha256: crypto.createHash('sha256').update(makeSplashFrame()).digest('hex') },
};

// Sanity check: OpenSSL must reproduce the FIPS-197 vector.
const f = crypto.createCipheriv('aes-128-ecb', Buffer.from(vectors.fips197.key, 'hex'), null);
f.setAutoPadding(false);
const fc = Buffer.concat([f.update(Buffer.from(vectors.fips197.plaintext, 'hex')), f.final()]).toString('hex');
if (fc !== vectors.fips197.ciphertext) throw new Error('OpenSSL does not match FIPS-197?!');

fs.writeFileSync(path.join(here, 'vectors.json'), JSON.stringify(vectors, null, 2) + '\n');
console.log('wrote test/vectors.json');
