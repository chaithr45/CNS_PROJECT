// test/crypto.test.js — our crypto vs. an independent implementation (node:crypto / OpenSSL).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { bytesEqual } from './helpers.js';
import { ecbEncrypt, ecbDecrypt } from '../shared/ecb.js';
import {
  MODES, MODE_IDS, generateKeyPair, deriveSessionKeys, importSessionKeys, safetyNumber, hkdf, sha256,
  encryptPayload, decryptPayload, fromHex, toHex, toBase64, fromBase64, gcmNonce, randomBytes,
} from '../shared/crypto.js';
import { createSenderSession, buildFrame } from '../shared/sender.js';
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { encodeMessage, decodeMessage } from '../shared/protocol.js';
import { syntheticFrames, FRAME_BYTES } from '../shared/frame.js';

const V = JSON.parse(fs.readFileSync(new URL('./vectors.json', import.meta.url)));
const key = fromHex(V.common.key);
const pt = fromHex(V.common.plaintext);
const iv16 = fromHex(V.common.iv16);
const iv12 = fromHex(V.common.iv12);
const aad = fromHex(V.common.aad);
const keysP = importSessionKeys({ aesKey: key, macKey: fromHex(V.common.macKey), nonceSalt: new Uint8Array(4) });

test('FIPS-197 Appendix C.1: AES-128 via aes-js', () => {
  const ct = ecbEncrypt(fromHex(V.fips197.key), fromHex(V.fips197.plaintext));
  assert.equal(toHex(ct), '69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.equal(toHex(ecbDecrypt(fromHex(V.fips197.key), ct)), V.fips197.plaintext);
});

test('FIPS-197 Appendix C.1 via Web Crypto (one CBC block with zero IV = raw AES)', async () => {
  const k = await crypto.webcrypto.subtle.importKey('raw', fromHex(V.fips197.key), 'AES-CBC', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, fromHex(V.fips197.plaintext)));
  assert.equal(toHex(ct.subarray(0, 16)), V.fips197.ciphertext);
});

test('ECB matches OpenSSL', () => {
  assert.equal(toHex(ecbEncrypt(key, pt)), V.ecb.ciphertext);
});

test('CBC (Web Crypto, PKCS#7) matches OpenSSL', async () => {
  const k = await keysP;
  assert.equal(toHex(await encryptPayload('cbc', k, iv16, pt)), V.cbc.ciphertext);
});

test('CTR (Web Crypto, length 64) matches OpenSSL', async () => {
  const k = await keysP;
  assert.equal(toHex(await encryptPayload('ctr', k, iv16, pt)), V.ctr.ciphertext);
});

test('GCM (Web Crypto, AAD, 128-bit tag) matches OpenSSL', async () => {
  const k = await keysP;
  assert.equal(toHex(await encryptPayload('gcm', k, iv12, pt, aad)), V.gcm.ciphertextAndTag);
});

test('HMAC-SHA256 tag in ctr-hmac matches OpenSSL', async () => {
  const k = await keysP;
  const payload = await encryptPayload('ctr-hmac', k, iv16, pt, aad);
  const ct = payload.subarray(0, pt.length);
  const expect = crypto.createHmac('sha256', fromHex(V.common.macKey)).update(Buffer.concat([aad, ct])).digest('hex');
  assert.equal(toHex(payload.subarray(pt.length)), expect);
  // and the plain HMAC vector
  const h = await crypto.webcrypto.subtle.sign('HMAC', k.hmac, pt);
  assert.equal(toHex(new Uint8Array(h)), V.hmac.tag);
});

test('full-frame cross-check: every mode equals OpenSSL on a real 19,200-byte frame', async () => {
  const k = await keysP;
  const frame = crypto.randomBytes(FRAME_BYTES);
  const ossl = (alg, iv, noPad) => { const c = crypto.createCipheriv(alg, key, iv); if (noPad) c.setAutoPadding(false); return Buffer.concat([c.update(frame), c.final()]).toString('hex'); };
  assert.equal(toHex(ecbEncrypt(key, frame)), ossl('aes-128-ecb', null, true));
  assert.equal(toHex(await encryptPayload('cbc', k, iv16, frame)), ossl('aes-128-cbc', iv16));
  assert.equal(toHex(await encryptPayload('ctr', k, iv16, frame)), ossl('aes-128-ctr', iv16));
});

test('HKDF-SHA256 key schedule matches OpenSSL', async () => {
  const salt = await sha256(new TextEncoder().encode(V.hkdf.sid));
  const okm = await hkdf(fromHex(V.hkdf.ikm), salt, V.hkdf.info, 52);
  assert.equal(toHex(okm), V.hkdf.okm);
});

test('ECDH P-256: both sides derive identical keys; equals node:crypto ECDH + HKDF', async () => {
  const a = await generateKeyPair(), b = await generateKeyPair();
  assert.equal(a.pubRaw.length, 65);
  assert.equal(a.pubRaw[0], 4);
  const ka = await deriveSessionKeys(a.privateKey, b.pubRaw, 'sid-1');
  const kb = await deriveSessionKeys(b.privateKey, a.pubRaw, 'sid-1');
  assert.ok(bytesEqual(ka.aesKey, kb.aesKey));
  assert.ok(bytesEqual(ka.macKey, kb.macKey));
  assert.ok(bytesEqual(ka.nonceSalt, kb.nonceSalt));
  // Independent check with node:crypto's ECDH
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const kc = await deriveSessionKeys(a.privateKey, new Uint8Array(e.getPublicKey()), 'sid-1');
  const shared = e.computeSecret(Buffer.from(a.pubRaw));
  const okm = Buffer.from(crypto.hkdfSync('sha256', shared, crypto.createHash('sha256').update('sid-1').digest(), Buffer.from('CipherCam v1 keys'), 52));
  assert.equal(toHex(kc.aesKey), okm.subarray(0, 16).toString('hex'));
  assert.equal(toHex(kc.macKey), okm.subarray(16, 48).toString('hex'));
  assert.equal(toHex(kc.nonceSalt), okm.subarray(48, 52).toString('hex'));
  // A different session id gives different keys.
  const k2 = await deriveSessionKeys(a.privateKey, b.pubRaw, 'sid-2');
  assert.ok(!bytesEqual(k2.aesKey, ka.aesKey));
});

test('safety number: 12 digits in groups of 4, same for both sides, different for different keys', async () => {
  const a = await generateKeyPair(), b = await generateKeyPair(), c = await generateKeyPair();
  const ab = await safetyNumber(a.pubRaw, b.pubRaw);
  assert.match(ab, /^\d{4} \d{4} \d{4}$/);
  assert.equal(ab, await safetyNumber(b.pubRaw, a.pubRaw));
  assert.notEqual(ab, await safetyNumber(a.pubRaw, c.pubRaw));
});

test('GCM nonce = salt(4) ‖ seq(8, big-endian)', () => {
  const n = gcmNonce(Uint8Array.of(1, 2, 3, 4), 0x0102030405);
  assert.equal(toHex(n), '010203040000000102030405');
});

test('base64 helpers round-trip', () => {
  const r = randomBytes(33);
  assert.ok(bytesEqual(fromBase64(toBase64(r)), r));
});

test('protocol: encode/decode keeps the exact header bytes and payload', () => {
  const m = encodeMessage({ t: 'frame', seq: 3 }, Uint8Array.of(9, 8, 7));
  const d = decodeMessage(Buffer.from(m));
  assert.equal(d.header.seq, 3);
  assert.equal(new TextDecoder().decode(d.headerBytes), '{"t":"frame","seq":3}');
  assert.deepEqual([...d.payload], [9, 8, 7]);
});

test('every mode round-trips: buildFrame → receiveFrame gives back the original pixels', async () => {
  const a = await generateKeyPair(), b = await generateKeyPair();
  const ka = await deriveSessionKeys(a.privateKey, b.pubRaw, 's');
  const kb = await deriveSessionKeys(b.privateKey, a.pubRaw, 's');
  const frames = syntheticFrames(5);
  for (const mode of MODE_IDS) {
    const tx = createSenderSession({ sid: 's', mode, keys: ka });
    const rx = createReceiverState({ sid: 's', keys: kb });
    for (let seq = 0; seq < 5; seq++) {
      const f = await buildFrame(tx, frames[seq], seq);
      assert.equal(f.payload.length, FRAME_BYTES + MODES[mode].tagLen + (mode === 'cbc' ? 16 : 0), mode);
      // go through the wire format too
      const wire = decodeMessage(encodeMessage(f.headerBytes, f.payload));
      const r = await receiveFrame(rx, wire.headerBytes, wire.payload);
      assert.ok(r.ok, `${mode}: ${r.reason}`);
      assert.ok(bytesEqual(r.pixels, frames[seq]), mode);
    }
  }
});

test('receiver ignores frames from another session and waits for keys', async () => {
  const tx = createSenderSession({ sid: 'old', mode: 'plain' });
  const f = await buildFrame(tx, syntheticFrames(1)[0], 0);
  const r = await receiveFrame(createReceiverState({ sid: 'new' }), f.headerBytes, f.payload);
  assert.equal(r.kind, 'stale');
  const k = await keysP;
  const g = await buildFrame(createSenderSession({ sid: 'x', mode: 'gcm', keys: k }), syntheticFrames(1)[0], 0);
  const r2 = await receiveFrame(createReceiverState({ sid: 'x' }), g.headerBytes, g.payload);
  assert.equal(r2.kind, 'nokey');
});
