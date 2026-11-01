// shared/protocol.js — the wire format of every WebSocket message.
//
//   [ 4 bytes: header length, unsigned 32-bit big-endian ]
//   [ header: JSON text, UTF-8                          ]
//   [ payload: raw bytes (may be empty)                 ]
//
// For video frames, the header bytes are EXACTLY what ctr-hmac and gcm authenticate,
// so the receiver uses the bytes it received — never JSON re-serialized by itself.

const te = new TextEncoder();
const td = new TextDecoder();
const EMPTY = new Uint8Array(0);

export function encodeHeader(obj) {
  return te.encode(JSON.stringify(obj));
}

// header: an object (will be JSON-encoded) or already-encoded header bytes.
export function encodeMessage(header, payload = EMPTY) {
  const hb = header instanceof Uint8Array ? header : encodeHeader(header);
  const out = new Uint8Array(4 + hb.length + payload.length);
  new DataView(out.buffer).setUint32(0, hb.length);
  out.set(hb, 4);
  out.set(payload, 4 + hb.length);
  return out;
}

function asBytes(data) {
  if (data instanceof Uint8Array) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return asBytes(concat(data)); // ws may hand over fragments
  throw new Error('unsupported message data');
}

function concat(list) {
  let n = 0;
  for (const p of list) n += p.byteLength;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of list) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; }
  return out;
}

// Returns { header, headerBytes, payload }. Throws on malformed input.
export function decodeMessage(data) {
  const b = asBytes(data);
  if (b.length < 4) throw new Error('message too short');
  const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0);
  if (4 + len > b.length) throw new Error('bad header length');
  const headerBytes = b.subarray(4, 4 + len);
  const header = JSON.parse(td.decode(headerBytes));
  const payload = b.subarray(4 + len);
  return { header, headerBytes, payload };
}

export function parseHeader(headerBytes) {
  return JSON.parse(td.decode(headerBytes));
}

// Message types used by CipherCam.
export const T = {
  FRAME: 'frame',          // Alice → relay → Bob (and copies to Eve / watchers)
  HELLO: 'hello',          // ECDH public key exchange
  STATE: 'state',          // server → everyone: the whole shared state
  CONTROL: 'control',      // client → server: a state patch (localhost only)
  RESTART: 'restart',      // client → server: start a fresh session
  PEER_JOINED: 'peer-joined',
  EVENT: 'event',          // a log line for the Stage
  EVE_PLAIN: 'eve-plain',  // frames Eve decrypted during MITM (Eve + watchers only)
  ERROR: 'error',
};
