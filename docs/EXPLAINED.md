# CipherCam — every idea, explained simply

This file explains each idea the demo uses. Each one has:

- a short plain-English explanation,
- an everyday analogy,
- a tiny worked example,
- and a pointer to the exact code (`file` → `function`) so you can show it.

You do not need to read code to understand this file. The pointers are there so you can open the file in an exam and say "here it is".

---

## The one big message

**AES itself is never broken in this demo.** AES is a very strong "block cipher". Every attack you see works because of *how* AES is used:

| What goes wrong | Attack in the demo | The fix |
|---|---|---|
| Same input → same output | ECB pattern leak | Randomized mode (CBC/CTR) with a fresh IV |
| Same keystream used twice | CTR nonce reuse | A unique nonce for every frame |
| Encryption ≠ protection from changes | Bit-flipping | A MAC: HMAC-SHA256 or AES-GCM |
| Old messages are still valid messages | Replay ("CCTV loop") | A frame counter that is covered by the MAC |
| You don't know whose key you got | Key-exchange MITM | Compare safety numbers |

---

## 1. AES — the block cipher

**What it is.** AES takes exactly **16 bytes** (one "block") and a **key** (we use 16 bytes = 128 bits), and outputs 16 scrambled bytes. With the key you can unscramble them. Without the key, the output looks completely random.

**Analogy.** A perfect lockable box that only fits one 16-byte letter at a time.

**Tiny example.** The official test from the AES standard (FIPS-197, Appendix C.1):

```
key        000102030405060708090a0b0c0d0e0f
plaintext  00112233445566778899aabbccddeeff
ciphertext 69c4e0d86a7b0430d8cdb78070b4c55a
```

Our tests check exactly this (`test/crypto.test.js`, and the `/selftest` page in the browser).

**The catch.** A video frame is 19,200 bytes, not 16. So we need a rule for using a 16-byte box on long messages. That rule is called a **mode of operation**. The modes are where all the trouble starts.

**Code.** AES itself comes from the browser's Web Crypto API (and the `aes-js` library for ECB). We never write AES ourselves.

---

## 2. Block modes: ECB, CBC, CTR, GCM

### ECB — "Electronic Code Book"

**What it is.** Cut the message into 16-byte blocks and encrypt each one on its own with the same key.

**Analogy.** A code book that always swaps "ATTACK" for "XQZPLM". Anyone can see that two messages both contain "XQZPLM", even without the book.

**Tiny example.** Two blocks that are both sixteen bytes of value 85 (a flat grey patch of wall) produce the *same* 16 ciphertext bytes. Eve sees "these two blocks are equal", and that is enough to draw your outline.

**Code.** `shared/ecb.js` → `ecbEncrypt` (uses `aes-js`, because Web Crypto deliberately leaves ECB out).

### CBC — "Cipher Block Chaining"

**What it is.** Before encrypting a block, XOR it with the previous ciphertext block. The very first block is XORed with a random **IV**. Equal plaintext blocks now give different ciphertext.

**Analogy.** Each letter's lock also depends on the letter before it, and the first letter gets a random starting twist.

**Detail.** CBC needs the message to be a multiple of 16 bytes, so Web Crypto adds 16 bytes of PKCS#7 padding. That is why a CBC frame is 19,216 bytes.

**Code.** `shared/crypto.js` → `encryptPayload` (case `'cbc'`).

### CTR — "Counter mode"

**What it is.** AES encrypts a counter (nonce, nonce+1, nonce+2, …) to make a long stream of random-looking bytes, the **keystream**. Then `ciphertext = plaintext XOR keystream`. It turns AES into a stream cipher.

**Analogy.** A one-time pad that AES generates for you from a starting number.

**Code.** `shared/crypto.js` → `encryptPayload` (case `'ctr'`), with `length: 64` (the low 64 bits count).

### GCM — "Galois/Counter Mode"

**What it is.** CTR encryption **plus** a built-in 16-byte **authentication tag** computed over the ciphertext and some extra data (here, the frame header). This is called **AEAD**: Authenticated Encryption with Associated Data.

**Analogy.** CTR's one-time pad, plus a tamper-evident seal over the envelope *and* the address label.

**Code.** `shared/crypto.js` → `encryptPayload` (case `'gcm'`) and `decryptPayload` (Web Crypto throws if the tag is wrong).

---

## 3. IV and nonce

**What they are.** An **IV** (initialisation vector) or **nonce** ("number used once") is a value that is mixed in so the same plaintext encrypts differently each time. It is **not secret**: it travels in the frame header.

- For CBC the IV must be **unpredictable** (random).
- For CTR and GCM the nonce must be **unique** (never repeated with the same key).

**How CipherCam picks them** (`shared/crypto.js` → `chooseIv`):

| Mode | IV / nonce |
|---|---|
| `cbc`, `ctr`, `ctr-hmac` | 16 fresh random bytes per frame |
| `ctr-reuse` | **the same** 16 bytes for every frame (the bug) |
| `gcm` | `nonceSalt (4 secret bytes) ‖ seq (8 bytes)`: unique because `seq` only goes up (`gcmNonce`) |

---

## 4. XOR

**What it is.** "Exclusive or", bit by bit: `0⊕0=0`, `0⊕1=1`, `1⊕0=1`, `1⊕1=0`. Two facts matter:

1. `A ⊕ A = 0`. Something XORed with itself disappears.
2. `A ⊕ B ⊕ B = A`. XOR twice with the same thing and you get back where you started.

**Tiny example.**

```
plaintext  1010 1010   (170, a light grey pixel)
keystream  0110 0011
ciphertext 1100 1001   (= plaintext ⊕ keystream)
ciphertext ⊕ keystream = 1010 1010  → the pixel again
```

**Code.** `shared/frame.js` → `xorBytes`; Eve's XOR view in `public/js/eve-view.js` → `createEveView`.

---

## 5. Keystream and nonce reuse

**What goes wrong.** If two frames are encrypted with the same nonce, they use the **same keystream K**:

```
C₁ = P₁ ⊕ K
C₂ = P₂ ⊕ K
C₁ ⊕ C₂ = P₁ ⊕ K ⊕ P₂ ⊕ K = P₁ ⊕ P₂          (K cancels out!)
```

So Eve learns the XOR of two pictures without any key. Where nothing moved, `P₁ ⊕ P₂ = 0` (black); where something moved, it is not zero (white). That is Eve's "XOR with previous frame" view.

**Known plaintext makes it total.** Every CipherCam call starts with 10 frames of a public "CIPHERCAM / CONNECTING" test card. Eve can build that card herself (`shared/frame.js` → `makeSplashFrame`). So:

```
K = C₀ ⊕ P_splash          (keystream recovered)
P = C ⊕ K                  (every later frame decrypted)
```

**Analogy.** Using a one-time pad twice. The second time it is no longer a one-time pad.

**Code.** The bug: `shared/crypto.js` → `chooseIv` (case `'ctr-reuse'`). The attack: `public/js/eve-view.js` → `onFrame` (look for `K = C₀ ⊕ splash`).

---

## 6. Malleability (bit-flipping)

**What it is.** In CTR (and any XOR-based cipher), flipping a bit of the ciphertext flips **the same bit** of the decrypted plaintext:

```
(C ⊕ M) ⊕ K = (P ⊕ K ⊕ M) ⊕ K = P ⊕ M
```

Eve picks a mask `M` shaped like a star, XORs it into the ciphertext, and Bob's picture gets a star stamped on it. Eve never learns the key or even sees the picture.

**Analogy.** A sealed letter written in invisible ink. You can't read it, but you can still smudge a star onto it, and the reader thinks the star was always there.

**Code.** `shared/stamps.js` → `makeStampMask`; `server/eve-active.js` → `applyBitflip`.

**Lesson.** Encryption gives **confidentiality**, not **integrity**. You need a MAC.

---

## 7. MAC and HMAC

**What a MAC is.** A "Message Authentication Code" is a short tag computed from the message **and a secret key**. Without the key, nobody can make a valid tag for a changed message.

**HMAC-SHA256.** A standard way to build a MAC from the SHA-256 hash function (RFC 2104). The tag is 32 bytes.

**Analogy.** A wax seal made with a ring only Alice and Bob own.

**Code.** `shared/crypto.js` → `encryptPayload` (case `'ctr-hmac'`): `tag = HMAC-SHA256(macKey, header ‖ ciphertext)`. Checking: `decryptPayload` uses `subtle.verify` **before** decrypting.

---

## 8. Encrypt-then-MAC

**What it is.** First encrypt, then compute the MAC over the **ciphertext** (and header). The receiver checks the MAC first and only decrypts data that is proven authentic.

**Why this order?** If you MAC the plaintext and then encrypt (MAC-then-encrypt), the receiver must decrypt *before* he can check anything. That has led to real attacks (padding oracles such as Lucky13 on TLS). Encrypt-then-MAC is the generically safe composition.

**Code.** `ctr-hmac` in `shared/crypto.js` → `encryptPayload` / `decryptPayload`.

---

## 9. AEAD (AES-GCM)

**What it is.** Authenticated Encryption with Associated Data: one primitive does both jobs. GCM encrypts with CTR and computes a 128-bit tag over (associated data ‖ ciphertext). In CipherCam the associated data is the frame header, so `seq`, `mode` and `iv` are protected too, even though they are not secret.

**Code.** `shared/crypto.js` → `encryptPayload` (case `'gcm'`, `additionalData: headerBytes`).

---

## 10. Replay

**What goes wrong.** A MAC proves "Alice made this". It does **not** prove "Alice made this *just now*". Eve records valid frames and plays them back later. Every replayed frame is genuine, so a MAC alone accepts it.

**Analogy.** The heist-movie CCTV loop: the guard watches a recording of an empty corridor.

**The fix.** Put a frame counter `seq` in the header, cover it with the MAC/tag, and make Bob accept a frame only if `seq > lastSeq`. Eve can't change `seq` (the tag would break), and old frames have old numbers.

**Code.** The attack: `server/eve-active.js` → `createReplay`. The check: `shared/receiver.js` → `receiveFrame` (`seq <= rx.lastSeq` → `REPLAY REJECTED`).

**Why only in the secure modes?** In CTR without a MAC, Eve could simply edit `seq` in the header. A counter only helps if it is authenticated.

---

## 11. ECDH — agreeing on a key in public

**What it is.** Elliptic-Curve Diffie-Hellman on the P-256 curve. Alice has a private number `a` and publishes the point `A = a·G`. Bob has `b` and publishes `B = b·G`. Alice computes `a·B`, Bob computes `b·A`, and both equal `a·b·G`. Eve sees `A` and `B` but can't compute `a·b·G` (that is the elliptic-curve discrete-log problem).

**Analogy.** Mixing paint. Both start from the same public colour, each adds a secret colour, they swap the mixtures, and each adds their secret again. Both end with the same colour; un-mixing paint is practically impossible.

**Tiny example.** Public keys are 65 bytes: `04 ‖ X (32 bytes) ‖ Y (32 bytes)`. You can see them travel in the `hello` messages.

**Code.** `shared/crypto.js` → `generateKeyPair`, `deriveSessionKeys`.

---

## 12. HKDF — turning one secret into several keys

**What it is.** HMAC-based Key Derivation Function (RFC 5869). The ECDH secret is 32 bytes, but we need three separate things: a 16-byte AES key, a 32-byte HMAC key and a 4-byte nonce salt. HKDF "extracts" randomness from the secret and "expands" it into as many independent-looking bytes as we want.

```
okm = HKDF-SHA256(ikm = ECDH secret, salt = SHA-256(session id), info = "CipherCam v1 keys", 52 bytes)
aesKey = okm[0..16)   macKey = okm[16..48)   nonceSalt = okm[48..52)
```

**Why?** Never use the same key for two different jobs. A different session id (salt) also gives completely different keys every session.

**Code.** `shared/crypto.js` → `hkdf`, `deriveSessionKeys`.

---

## 13. MITM — the man in the middle

**What goes wrong.** ECDH proves "I share a key with *whoever sent me this public key*". It does not say *who* that was. Eve sits in the relay and swaps the keys:

```
Alice ──A──► Eve ──E2──► Bob          Alice ⇄ Eve: key k_AE
Alice ◄─E1── Eve ◄──B─── Bob          Eve ⇄ Bob:   key k_EB
```

Eve decrypts every frame with `k_AE`, looks at it, re-encrypts it with `k_EB` (same mode, same `seq`) and sends it on. GCM tags are valid, counters go up, Bob is happy. **Even perfect AES-GCM can't help if the key belongs to the wrong person.**

**Code.** `server/eve-active.js` → `createMitm` (`onHello` swaps the keys, `transform` decrypts and re-encrypts using the same `receiveFrame` / `buildFrame` code as Bob and Alice).

---

## 14. Safety numbers

**What they are.** A short fingerprint of *both* public keys:

```
SHA-256("CipherCam safety" ‖ smaller key ‖ larger key) → first 6 bytes → 12 digits, e.g. 4123 8065 6060
```

Sorting the two keys means Alice and Bob compute the same number. If Eve swapped the keys, Alice fingerprints (A, E1) and Bob fingerprints (E2, B): **different numbers**. Alice and Bob compare them over another channel ("out-of-band", e.g. reading them aloud), and Eve is caught. Signal and WhatsApp do exactly this.

**Code.** `shared/crypto.js` → `safetyNumber`. The out-of-band channel in the demo is a `BroadcastChannel` between the pages on the laptop (`public/js/common.js` → `oobChannel`).

---

## 15. Why the frames are posterized and tiled

**Posterize** (`shared/frame.js` → `createPipeline`, `posterizeValue`). A real camera adds noise, so no two 4×4 patches are ever exactly equal, and even ECB would look random. We reduce the picture to a few grey levels (default 4: 0, 85, 170, 255). Before that we:

1. average every 4×4 group of camera pixels (`downscaleToLuma`),
2. smooth each pixel over time (`avg = 0.6·avg + 0.4·new`),
3. add **hysteresis**: a pixel only changes level when it clearly crosses a boundary (margin 6), so it doesn't flicker.

Now a flat wall really is identical bytes, which is what makes the ECB leak visible. (Real images have plenty of repetition too. Posterizing just makes it obvious on a projector.)

**Tile** (`shared/frame.js` → `toTiles`, `fromTiles`). We send the frame as 1,200 tiles of 4×4 pixels. Each tile is exactly 16 bytes = **one AES block**. So "one block" means "one square patch of the picture", and Eve's block-colour view draws one coloured square per block. In normal row order a block would be a 16×1 strip, and the outline would be far less clear.

---

## 16. What each attack proves

| Step | What you see | What it proves |
|---|---|---|
| 1 Encrypted call | Eve sees noise | Good encryption hides content. |
| 2 ECB | Eve's block colours show your outline; leak meter ≈ 90 % | Deterministic encryption leaks patterns. A strong cipher in a weak mode is weak. |
| 3 Nonce reuse | Eve watches the call in the clear | A nonce must never repeat. One known plaintext + reuse = total break. |
| 4 Bit-flip | A star appears on Bob's video | Encryption gives no integrity. Ciphertext can be changed in a controlled way. |
| 5 CCTV loop | Bob sees someone who has left | Valid ≠ fresh. You need an authenticated counter or timestamp. |
| 6 AES-GCM | Bob rejects both attacks with red alerts | AEAD + a counter gives confidentiality, integrity and freshness. Eve can block but not fake. |
| 7 MITM | Eve decrypts everything, Bob still accepts | Key exchange needs authentication. Crypto can't fix "wrong key". |
| 8 Safety numbers | Numbers match, Eve back to noise | Comparing fingerprints out-of-band authenticates the key exchange. |

---

## 17. Where everything lives (code map)

| Idea | File → function |
|---|---|
| Camera → 160×120 grey | `shared/frame.js` → `downscaleToLuma` |
| Smoothing + posterize + hysteresis | `shared/frame.js` → `createPipeline`, `posterizeValue` |
| 4×4 tile layout | `shared/frame.js` → `toTiles`, `fromTiles` |
| Splash test card (known plaintext) | `shared/frame.js` → `makeSplashFrame` |
| Synthetic scene ("person leaves the room") | `shared/frame.js` → `createSyntheticScene` |
| Leak meter | `shared/frame.js` → `leakPercent` |
| ECB | `shared/ecb.js` → `ecbEncrypt`, `ecbDecrypt` |
| All modes (encrypt / decrypt) | `shared/crypto.js` → `encryptPayload`, `decryptPayload` |
| IV / nonce choice | `shared/crypto.js` → `chooseIv`, `gcmNonce` |
| ECDH + HKDF | `shared/crypto.js` → `generateKeyPair`, `deriveSessionKeys`, `hkdf` |
| Safety number | `shared/crypto.js` → `safetyNumber` |
| Building a frame (Alice) | `shared/sender.js` → `buildFrame` |
| Checking a frame (Bob) | `shared/receiver.js` → `receiveFrame` |
| Wire format | `shared/protocol.js` → `encodeMessage`, `decodeMessage` |
| Bit-flip / replay / MITM (Eve, active) | `server/eve-active.js` → `applyBitflip`, `createReplay`, `createMitm` |
| Eve's passive views | `public/js/eve-view.js` → `createEveView` |
| The scripted demo | `shared/steps.js` → `STEPS`, `stepPatch` |
