// shared/sender.js — Alice's side: turn 160×120 pixels into one encrypted frame.
// Used by the Alice page AND by Eve's man-in-the-middle re-encryption in the relay.

import { toTiles, W, H } from './frame.js';
import { chooseIv, encryptPayload, toBase64 } from './crypto.js';
import { encodeHeader } from './protocol.js';

// A sender session = everything Alice needs for one call.
//   keys: from deriveSessionKeys() (null is fine for 'plain')
export function createSenderSession({ sid, mode, keys = null, levels = 4 }) {
  return { sid, mode, keys, levels, reuseIv: null };
}

// buildFrame(session, pixels, seq) → { header, headerBytes, payload }
//   pixels: row-major 160×120 grayscale bytes
//   seq:    frame counter, 0, 1, 2, ... (restarts at 0 every session)
export async function buildFrame(session, pixels, seq, { ts = Date.now() } = {}) {
  const { mode, keys } = session;
  if (mode !== 'plain' && !keys) throw new Error('no session keys yet');
  // 1. Re-order the pixels into 4×4 tiles: each AES block = one tile.
  const plain = toTiles(pixels);
  // 2. Pick this frame's IV / nonce (random, reused, or salt‖seq for GCM).
  const iv = chooseIv(mode, keys, seq, session);
  // 3. Build the header. It travels in the clear, but ctr-hmac and gcm authenticate it,
  //    so Eve cannot change seq, mode or iv without being caught.
  const header = { t: 'frame', sid: session.sid, seq, mode, iv: iv ? toBase64(iv) : null, w: W, h: H, levels: session.levels, ts };
  const headerBytes = encodeHeader(header);
  // 4. Encrypt (and authenticate, for the secure modes).
  const payload = await encryptPayload(mode, keys, iv, plain, headerBytes);
  return { header, headerBytes, payload };
}
