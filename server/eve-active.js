// server/eve-active.js — Eve's ACTIVE attacks. These run inside the relay ("the network"),
// because an active attacker changes, replays or injects traffic as it passes through.
//
//   * bit-flip:   XOR a picture-shaped mask into the ciphertext
//   * replay:     record N seconds of valid frames, then loop them to Bob
//   * MITM:       swap the ECDH public keys, decrypt with Alice's key, re-encrypt for Bob
//
// None of these ever learns the key by breaking AES. They only exploit HOW AES is used.

import { MODES, generateKeyPair, deriveSessionKeys, safetyNumber } from '../shared/crypto.js';
import { FRAME_BYTES } from '../shared/frame.js';
import { createSenderSession, buildFrame } from '../shared/sender.js';
import { createReceiverState, receiveFrame } from '../shared/receiver.js';
import { parseHeader } from '../shared/protocol.js';

// ---------------------------------------------------------------------------
// Bit-flip: payload[i] ^= mask[i] for the first 19,200 bytes (never the tag).
// ---------------------------------------------------------------------------
// In CTR mode ciphertext = plaintext XOR keystream, so flipping a ciphertext bit flips
// exactly the same plaintext bit after decryption. Eve does not need the key.
export function applyBitflip(mode, payload, mask) {
  const out = payload.slice();                        // never modify the original copy
  let limit = Math.min(FRAME_BYTES, out.length - MODES[mode].tagLen);
  // CBC: leave the last 32 bytes alone, so the padding block still decrypts cleanly.
  if (mode === 'cbc') limit = Math.min(limit, out.length - 32);
  for (let i = 0; i < limit; i++) out[i] ^= mask[i];
  return out;
}

// ---------------------------------------------------------------------------
// Replay ("CCTV loop"): record frames with their timing, then play them back in a loop.
// ---------------------------------------------------------------------------
export function createReplay() {
  let frames = [];     // [{ headerBytes, payload, t }]  t = ms since recording started
  let startT = 0;
  let seconds = 5;
  return {
    get frames() { return frames; },
    get duration() { return frames.length ? frames[frames.length - 1].t : 0; },
    start(secs, now = Date.now()) { frames = []; startT = now; seconds = secs; },
    // Returns true once N seconds have been recorded.
    add(headerBytes, payload, now = Date.now()) {
      const t = now - startT;
      if (t > seconds * 1000) return true;
      frames.push({ headerBytes: headerBytes.slice(), payload: payload.slice(), t });
      return t >= seconds * 1000 - 50;
    },
    clear() { frames = []; },
  };
}

// ---------------------------------------------------------------------------
// MITM on the ECDH key exchange.
// ---------------------------------------------------------------------------
// Eve makes two key pairs per session: E1 (she pretends to be Bob towards Alice) and
// E2 (she pretends to be Alice towards Bob). Alice ends up sharing a key with Eve (k_AE),
// Bob ends up sharing a different key with Eve (k_EB). Neither notices — unless they
// compare safety numbers.
export async function createMitm(sid) {
  const e1 = await generateKeyPair();   // shown to Alice instead of Bob's key
  const e2 = await generateKeyPair();   // shown to Bob instead of Alice's key
  const m = {
    sid, e1, e2,
    kAE: null, kEB: null,               // session keys with Alice / with Bob
    alicePub: null, bobPub: null,
    rx: null, tx: null,
    // Called with each hello. Returns the public key the relay should forward instead.
    async onHello(role, pubRaw) {
      if (role === 'alice') {
        m.alicePub = pubRaw;
        m.kAE = await deriveSessionKeys(e1.privateKey, pubRaw, sid);   // Eve ↔ Alice
        m.rx = createReceiverState({ sid, keys: m.kAE });
        return e2.pubRaw;               // Bob receives E2 instead of Alice's key
      }
      m.bobPub = pubRaw;
      m.kEB = await deriveSessionKeys(e2.privateKey, pubRaw, sid);     // Eve ↔ Bob
      m.tx = null;
      return e1.pubRaw;                 // Alice receives E1 instead of Bob's key
    },
    get ready() { return !!(m.kAE && m.kEB); },
    // Decrypt a frame from Alice with k_AE (no replay checks), and re-encrypt it for Bob
    // with k_EB in the same mode and with the same seq. Returns
    //   { pixels, header, forward: { headerBytes, payload } }   or   { error }.
    async transform(headerBytes, payload) {
      if (!m.ready) return { error: 'keys not ready' };
      const header = parseHeader(headerBytes);
      const r = await receiveFrame(m.rx, headerBytes, payload, { checks: false });
      if (!r.ok) return { error: r.reason };
      if (!m.tx || m.tx.mode !== header.mode) m.tx = createSenderSession({ sid, mode: header.mode, keys: m.kEB, levels: header.levels });
      const fwd = await buildFrame(m.tx, r.pixels, header.seq, { ts: header.ts });
      return { pixels: r.pixels, header, forward: { headerBytes: fwd.headerBytes, payload: fwd.payload } };
    },
    // What Alice and Bob will each see as their safety number (for logging only).
    async safetyNumbers() {
      return {
        alice: m.alicePub ? await safetyNumber(m.alicePub, e1.pubRaw) : null,
        bob: m.bobPub ? await safetyNumber(e2.pubRaw, m.bobPub) : null,
      };
    },
  };
  return m;
}
