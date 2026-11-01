// shared/steps.js — the scripted demo. The Stage sidebar, the auto-play ('A' key), the
// end-to-end tests and docs/DEMO_GUIDE.md all use THIS list, so they never disagree.
//
// Each step sets the WHOLE configuration (mode, Eve's view, every attack) and restarts
// the session, so any step can be reached from any other step with no leftover state.
// `actions` are timed changes (milliseconds after the step starts) for steps that tell
// a little story (the CCTV loop, the secure-mode attack attempts).

// Everything off: the starting point every step is applied on top of.
export const BASE_CONFIG = {
  mode: 'ctr',
  eveView: 'raw',
  leakHighlight: false,
  away: false,
  wave: false,
  overlay: null,
  attacks: { bitflip: { on: false, stamp: 'star' }, replay: { phase: 'off', seconds: 5 }, mitm: { on: false } },
};

export const STEPS = [
  {
    n: 0,
    title: 'Plain video (optional)',
    caption: 'No encryption: anyone on the Wi-Fi sees you.',
    formula: 'C = P',
    say: 'This is a video call with no encryption at all. Eve sits in the relay, like a hacked Wi-Fi router. She sees exactly what Bob sees.',
    config: { mode: 'plain' },
    duration: 8000,
    expect: { bobOk: true },
  },
  {
    n: 1,
    title: 'Encrypted call',
    caption: 'Encrypted with AES-CTR: Eve sees pure noise. But is it secure?',
    formula: 'C = P ⊕ AES_K(nonce ‖ counter)',
    say: 'Now Alice encrypts every frame with AES in counter mode, with a fresh random nonce per frame. Eve only sees noise. AES is never broken in this demo — every attack you will see comes from how AES is used.',
    config: { mode: 'ctr' },
    duration: 8000,
    expect: { bobOk: true, leakMax: 5 },
  },
  {
    n: 2,
    title: 'ECB leaks the shape',
    caption: 'Same pixels in, same ciphertext out — your outline leaks.',
    formula: 'P₁ = P₂  ⇒  AES_K(P₁) = AES_K(P₂)',
    say: 'Now we switch to ECB mode. Each 16-byte block is one 4-by-4 patch of the picture, encrypted on its own. Identical patches of wall give identical ciphertext, so Eve sees my outline without knowing the key. Look at the leak meter.',
    config: { mode: 'ecb', eveView: 'blocks', leakHighlight: true },
    duration: 10000,
    expect: { bobOk: true, leakMin: 50 },
  },
  {
    n: 3,
    title: 'Nonce reuse',
    caption: 'Same keystream twice + one known frame = Eve watches without the key.',
    formula: 'C₁ ⊕ C₂ = P₁ ⊕ P₂   ·   K = C₀ ⊕ P_splash   ·   P = C ⊕ K',
    say: 'Back to CTR, but with a bug: the nonce is reused for every frame. Every call starts with a public Connecting screen, so Eve knows one plaintext. Ciphertext XOR known plaintext gives her the keystream, and now she watches the whole call in the clear.',
    config: { mode: 'ctr-reuse', eveView: 'keystream' },
    duration: 10000,
    expect: { bobOk: true, nonceReuse: true, keystream: true },
  },
  {
    n: 4,
    title: 'Bit-flipping',
    caption: 'Eve flips ciphertext bits → the same pixels flip on Bob\'s screen.',
    formula: '(C ⊕ M) ⊕ K = P ⊕ M',
    say: 'Encryption hides data but does not protect it. CTR is just XOR, so when Eve flips bits in the ciphertext, the same bits flip in Bob\'s picture. She stamps a star onto Bob\'s video without ever knowing the key, and Bob accepts it.',
    config: { mode: 'ctr', attacks: { bitflip: { on: true, stamp: 'star' } } },
    duration: 9000,
    expect: { bobOk: true, bitflip: true },
  },
  {
    n: 5,
    title: 'CCTV loop',
    caption: 'Old frames are still valid frames. Bob sees the past.',
    formula: 'no authenticated counter  ⇒  replayed frames accepted',
    say: 'Eve records five seconds of valid, encrypted frames. Then I leave the room, and Eve loops the old recording to Bob — like a heist movie CCTV loop. Bob still sees me, because old frames are perfectly valid ciphertext.',
    config: { mode: 'ctr' },
    actions: [
      { at: 1800, patch: { wave: true, attacks: { replay: { phase: 'recording', seconds: 5 } } }, overlay: '● REC  5 — wave now!' },
      { at: 2800, overlay: '● REC  4 — wave now!' },
      { at: 3800, overlay: '● REC  3 — wave now!' },
      { at: 4800, overlay: '● REC  2 — wave now!' },
      { at: 5800, overlay: '● REC  1 — wave now!' },
      { at: 7000, patch: { wave: false, away: true }, overlay: 'The person leaves the room…' },
      { at: 9000, patch: { attacks: { replay: { phase: 'looping' } } }, overlay: '⟲ Eve loops the old frames — Bob still sees the person' },
    ],
    duration: 17000,
    expect: { bobOk: true, replayLooping: true },
  },
  {
    n: 6,
    title: 'Secure mode',
    caption: 'AES-GCM + frame counter: tampering and replays are caught.',
    formula: 'tag = GMAC_K(header, C)   ·   accept only if tag ✓ and seq > lastSeq',
    say: 'Now the fix: AES-GCM. Every frame carries a 128-bit authentication tag over the header and the ciphertext, and a frame counter that must always go up. Eve tries the bit-flip: rejected. She tries the replay: rejected. She can block the call, but she can never fake it.',
    config: { mode: 'gcm' },
    actions: [
      { at: 2500, patch: { attacks: { bitflip: { on: true, stamp: 'star' } } }, overlay: 'Eve tries the bit-flip…' },
      { at: 6000, patch: { attacks: { bitflip: { on: false } } }, overlay: null },
      { at: 6500, patch: { attacks: { replay: { phase: 'recording', seconds: 3 } } }, overlay: 'Eve records 3 s of frames…' },
      { at: 10000, patch: { attacks: { replay: { phase: 'looping' } } }, overlay: 'Eve tries the replay…' },
      { at: 14500, patch: { attacks: { replay: { phase: 'off' } } }, overlay: null },
    ],
    subActions: [
      { id: 'try-bitflip', label: 'Try bit-flip', actions: [
        { at: 0, patch: { attacks: { bitflip: { on: true, stamp: 'star' } } }, overlay: 'Eve tries the bit-flip…' },
        { at: 3500, patch: { attacks: { bitflip: { on: false } } }, overlay: null },
      ] },
      { id: 'try-replay', label: 'Try replay', actions: [
        { at: 0, patch: { attacks: { replay: { phase: 'recording', seconds: 3 } } }, overlay: 'Eve records 3 s of frames…' },
        { at: 3500, patch: { attacks: { replay: { phase: 'looping' } } }, overlay: 'Eve tries the replay…' },
        { at: 8000, patch: { attacks: { replay: { phase: 'off' } } }, overlay: null },
      ] },
    ],
    duration: 17000,
    expect: { leakMax: 5, rejectedTamper: true, rejectedReplay: true },
  },
  {
    n: 7,
    title: 'MITM finale',
    caption: 'Eve swapped the keys: she sees everything, but the safety numbers don\'t match.',
    formula: 'Alice ⇄ Eve ⇄ Bob:  k_AE ≠ k_EB',
    say: 'Even AES-GCM falls if the keys are not authenticated. Eve swaps the ECDH public keys during the handshake. She now shares one key with Alice and another with Bob, decrypts everything and re-encrypts it. Bob accepts every frame. The only clue: the safety numbers no longer match.',
    config: { mode: 'gcm', attacks: { mitm: { on: true } } },
    duration: 12000,
    expect: { bobOk: true, safety: 'mismatch', eveHasKey: true },
  },
  {
    n: 8,
    title: 'Verified keys',
    caption: 'Checking the safety number defeats the man-in-the-middle.',
    formula: 'SHA-256("CipherCam safety" ‖ pub_min ‖ pub_max) → same 12 digits on both screens',
    say: 'Alice and Bob read their safety numbers to each other over another channel. Now they match, so nobody swapped the keys. Eve is back to seeing noise. Five attacks, five fixes — and AES itself was never broken.',
    config: { mode: 'gcm', attacks: { mitm: { on: false } } },
    duration: 10000,
    expect: { bobOk: true, safety: 'match', leakMax: 5 },
  },
];

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  }
  return out;
}

// The full control patch that puts the system into step n (fresh session, attacks reset).
export function stepPatch(n) {
  const s = STEPS[n];
  return { ...merge(BASE_CONFIG, s.config), step: n, restart: true };
}

export function stepTitle(n) {
  return STEPS[n] ? `${n}. ${STEPS[n].title}` : '';
}
