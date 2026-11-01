// shared/receiver.js — Bob's side: check and decrypt one frame.
// Used by the Bob page AND by Eve's man-in-the-middle decryption in the relay.

import { fromTiles, FRAME_BYTES } from './frame.js';
import { decryptPayload, fromBase64, gcmNonce, MODES } from './crypto.js';
import { parseHeader } from './protocol.js';

export function createReceiverState({ sid, keys = null }) {
  return { sid, keys, lastSeq: -1 };
}

// receiveFrame(rx, headerBytes, payload) → { ok, pixels?, header?, reason?, kind? }
//   kind (on failure): 'tamper' | 'replay' | 'decrypt' | 'stale' | 'nokey' | 'bad'
//   options.checks = false skips the replay (sequence) check — used by Eve's MITM.
export async function receiveFrame(rx, headerBytes, payload, { checks = true } = {}) {
  let header;
  try { header = parseHeader(headerBytes); } catch { return { ok: false, kind: 'bad', reason: 'BAD HEADER' }; }
  const { mode, seq } = header;
  if (!MODES[mode] || !Number.isSafeInteger(seq) || seq < 0) return { ok: false, kind: 'bad', header, reason: 'BAD HEADER' };
  // Frames from an old session (e.g. still in flight during a restart) are just ignored.
  if (rx.sid && header.sid !== rx.sid) return { ok: false, kind: 'stale', header, reason: 'old session' };
  if (mode !== 'plain' && !rx.keys) return { ok: false, kind: 'nokey', header, reason: 'waiting for keys' };
  if (payload.length < FRAME_BYTES + MODES[mode].tagLen) return { ok: false, kind: 'decrypt', header, reason: 'DECRYPTION ERROR (short frame)' };

  // For GCM we rebuild the nonce ourselves from our secret salt + the (authenticated) seq.
  let iv = null;
  try {
    iv = mode === 'gcm' ? gcmNonce(rx.keys.nonceSalt, seq) : header.iv ? fromBase64(header.iv) : null;
  } catch { return { ok: false, kind: 'bad', header, reason: 'BAD IV' }; }

  let plainTiles;
  try {
    plainTiles = await decryptPayload(mode, rx.keys, iv, payload, headerBytes);
  } catch (err) {
    if (err.kind === 'tamper') return { ok: false, kind: 'tamper', header, reason: 'TAMPERED FRAME REJECTED (tag mismatch)' };
    return { ok: false, kind: 'decrypt', header, reason: 'DECRYPTION ERROR' };
  }

  // Replay check — only the authenticated modes can do this safely, because only there
  // is `seq` protected by the MAC. A frame must be NEWER than the last one we accepted.
  if (checks && MODES[mode].integrity && seq <= rx.lastSeq) {
    return { ok: false, kind: 'replay', header, reason: `REPLAY REJECTED (seq ${seq} ≤ last ${rx.lastSeq})` };
  }
  if (seq > rx.lastSeq) rx.lastSeq = seq;
  return { ok: true, header, pixels: fromTiles(plainTiles) };
}
