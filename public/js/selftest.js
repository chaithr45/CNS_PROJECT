// public/js/selftest.js — known-answer tests for every primitive CipherCam uses, in the browser.
import { $, initPage, setupAesJs } from '/js/common.js';

const results = [];
window.__selftest = { done: false, results, pass: 0, fail: 0 };

function row(ok, name, details) {
  results.push({ ok, name, details });
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="res ${ok ? 'pass' : 'fail'}">${ok ? '✓ PASS' : '✗ FAIL'}</td><td></td><td class="small mono"></td>`;
  tr.children[1].textContent = name;
  tr.children[2].textContent = details;
  $('#rows').appendChild(tr);
}

async function check(name, fn) {
  try {
    const [ok, details] = await fn();
    row(ok, name, details);
  } catch (e) {
    row(false, name, `error: ${e.message}`);
  }
}

if (initPage({ needsCrypto: true })) {
  await setupAesJs();
  const { ecbEncrypt } = await import('/shared/ecb.js');
  const C = await import('/shared/crypto.js');
  const { createSenderSession, buildFrame } = await import('/shared/sender.js');
  const { createReceiverState, receiveFrame } = await import('/shared/receiver.js');
  const F = await import('/shared/frame.js');
  const V = await (await fetch('/vectors.json')).json();
  const { fromHex, toHex } = C;
  const subtle = crypto.subtle;
  const key = fromHex(V.common.key), pt = fromHex(V.common.plaintext), iv16 = fromHex(V.common.iv16), iv12 = fromHex(V.common.iv12), aad = fromHex(V.common.aad);
  const keys = await C.importSessionKeys({ aesKey: key, macKey: fromHex(V.common.macKey), nonceSalt: new Uint8Array(4) });
  const same = (got, want) => [got === want, `got ${got.slice(0, 32)}…  expected ${want.slice(0, 32)}…`];

  await check('AES-128 block cipher (aes-js) — FIPS-197 Appendix C.1', () => same(toHex(ecbEncrypt(fromHex(V.fips197.key), fromHex(V.fips197.plaintext))), V.fips197.ciphertext));
  await check('AES-128 block cipher (Web Crypto) — FIPS-197 Appendix C.1', async () => {
    const k = await subtle.importKey('raw', fromHex(V.fips197.key), 'AES-CBC', false, ['encrypt']);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, k, fromHex(V.fips197.plaintext)));
    return same(toHex(ct.subarray(0, 16)), V.fips197.ciphertext);
  });
  await check('AES-ECB (aes-js) vs OpenSSL', () => same(toHex(ecbEncrypt(key, pt)), V.ecb.ciphertext));
  await check('AES-CBC with PKCS#7 padding (Web Crypto) vs OpenSSL', async () => same(toHex(await C.encryptPayload('cbc', keys, iv16, pt)), V.cbc.ciphertext));
  await check('AES-CTR, 64-bit counter (Web Crypto) vs OpenSSL', async () => same(toHex(await C.encryptPayload('ctr', keys, iv16, pt)), V.ctr.ciphertext));
  await check('AES-GCM with AAD, 128-bit tag (Web Crypto) vs OpenSSL', async () => same(toHex(await C.encryptPayload('gcm', keys, iv12, pt, aad)), V.gcm.ciphertextAndTag));
  await check('AES-GCM rejects a single flipped bit', async () => {
    const ct = await C.encryptPayload('gcm', keys, iv12, pt, aad);
    ct[5] ^= 1;
    try { await C.decryptPayload('gcm', keys, iv12, ct, aad); return [false, 'tampered ciphertext was accepted!']; } catch (e) { return [e.kind === 'tamper', `decrypt refused: ${e.message}`]; }
  });
  await check('HMAC-SHA256 (Web Crypto) vs OpenSSL', async () => same(toHex(new Uint8Array(await subtle.sign('HMAC', keys.hmac, pt))), V.hmac.tag));
  await check('HKDF-SHA256 key schedule vs OpenSSL', async () => {
    const salt = await C.sha256(new TextEncoder().encode(V.hkdf.sid));
    return same(toHex(await C.hkdf(fromHex(V.hkdf.ikm), salt, V.hkdf.info, 52)), V.hkdf.okm);
  });
  await check('ECDH P-256: both sides derive the same keys', async () => {
    const a = await C.generateKeyPair(), b = await C.generateKeyPair();
    const ka = await C.deriveSessionKeys(a.privateKey, b.pubRaw, 'x'), kb = await C.deriveSessionKeys(b.privateKey, a.pubRaw, 'x');
    const ok = toHex(ka.aesKey) === toHex(kb.aesKey) && toHex(ka.macKey) === toHex(kb.macKey) && a.pubRaw.length === 65;
    return [ok, `65-byte public keys; shared AES key ${toHex(ka.aesKey).slice(0, 16)}… on both sides`];
  });
  await check('Safety number is the same from both sides', async () => {
    const a = await C.generateKeyPair(), b = await C.generateKeyPair();
    const x = await C.safetyNumber(a.pubRaw, b.pubRaw), y = await C.safetyNumber(b.pubRaw, a.pubRaw);
    return [x === y && /^\d{4} \d{4} \d{4}$/.test(x), `${x} / ${y}`];
  });
  await check('Splash test card is byte-identical to Node.js', async () => same(toHex(await C.sha256(F.makeSplashFrame())), V.splash.sha256));
  await check('All 7 modes round-trip a real frame (sender → receiver)', async () => {
    const a = await C.generateKeyPair(), b = await C.generateKeyPair();
    const ka = await C.deriveSessionKeys(a.privateKey, b.pubRaw, 's'), kb = await C.deriveSessionKeys(b.privateKey, a.pubRaw, 's');
    const px = F.syntheticFrames(3)[2];
    const bad = [];
    for (const mode of C.MODE_IDS) {
      const f = await buildFrame(createSenderSession({ sid: 's', mode, keys: ka }), px, 0);
      const r = await receiveFrame(createReceiverState({ sid: 's', keys: kb }), f.headerBytes, f.payload);
      if (!r.ok || r.pixels.some((v, i) => v !== px[i])) bad.push(mode);
    }
    return [bad.length === 0, bad.length ? `failed: ${bad.join(', ')}` : C.MODE_IDS.join(', ')];
  });
}

window.__selftest.pass = results.filter((r) => r.ok).length;
window.__selftest.fail = results.filter((r) => !r.ok).length;
window.__selftest.done = true;
const s = $('#summary');
if (!results.length) s.textContent = 'Not run: this page needs a secure context (http://localhost).';
else {
  s.textContent = window.__selftest.fail ? `✗ ${window.__selftest.fail} of ${results.length} tests FAILED` : `✓ All ${results.length} tests passed`;
  s.style.color = window.__selftest.fail ? 'var(--bad)' : 'var(--ok)';
}
