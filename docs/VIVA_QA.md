# CipherCam — Viva Questions & Answers

Short, correct answers to the questions an examiner is likely to ask. Learn the **bold** sentence of each answer; the rest is backup.

---

## A. The big picture

**1. What does your project show, in one sentence?**
**That a strong cipher (AES) can still be completely insecure when it is used the wrong way, and how to use it correctly.** Five attacks (ECB leak, nonce reuse, bit-flipping, replay, MITM), each shown live and then fixed.

**2. Is AES broken in your demo?**
**No. Every attack exploits the mode, the nonce, the missing MAC, the missing counter or the missing key authentication.** We never attack AES itself. Our AES even passes the official FIPS-197 test vector (`/selftest`).

**3. Is this a real attack, or a toy?**
**The attacks are real and have happened in practice.** ECB leaks are the classic "ECB penguin" (and Adobe's 2013 password leak used ECB-encrypted passwords). Nonce reuse broke WEP and has broken GCM implementations in TLS ("Nonce-Disrespecting Adversaries", 2016). Unauthenticated CBC/CTR led to bit-flipping and padding-oracle attacks. Replay is why every protocol (TLS, IPsec, Signal) has sequence numbers. MITM on unauthenticated Diffie-Hellman is exactly why TLS uses certificates and Signal uses safety numbers. Our simplifications: a tiny 160×120 posterized video, and an attacker who controls the relay.

**4. Which syllabus units does it cover?**
**Unit 1: attacks and security services (passive vs active attacks, confidentiality, integrity, authentication). Unit 2: AES and block-cipher modes (ECB, CBC, CTR, GCM). Unit 3: ECDH key exchange. Unit 4: MACs, HMAC, authentication and replay.**

**5. Which security services does each fix give?**
Random IV / unique nonce → **confidentiality**. MAC / AEAD tag → **data integrity and data-origin authentication**. Authenticated counter → **freshness (anti-replay)**. Safety numbers → **entity authentication of the key exchange**.

**6. Which attacks are passive and which are active?**
**Passive: ECB pattern leak and nonce-reuse keystream recovery (Eve only reads).** Active: bit-flipping, replay and MITM (Eve changes, re-sends or injects traffic). Passive attacks are about confidentiality; active attacks are about integrity and authentication.

---

## B. AES and block modes

**7. If AES is secure, why does ECB leak?**
**ECB is deterministic: the same 16-byte plaintext block with the same key always gives the same ciphertext block.** AES hides *what* a block says, but not *whether two blocks are equal*. A flat wall has many identical blocks, so the pattern of equal blocks draws the picture.

**8. Why did you posterize and tile the video?**
**So that "equal blocks" really happen and are easy to see.** Camera noise makes almost every 4×4 patch slightly different, so we average, smooth and reduce to 4 grey levels. Tiling makes each AES block a 4×4 square of the image, so Eve's block view is a coarse but recognisable picture. Real data (images, database fields, file headers) has plenty of repetition anyway.

**9. What does the leak meter measure?**
**The percentage of 16-byte ciphertext blocks in one frame that are an exact copy of another block in the same frame.** About 90% for ECB, 0% for every randomized mode.

**10. Why does the nonce-reuse mode show 0% on the leak meter?**
**Inside one frame, CTR's keystream is still random, so no blocks repeat.** The flaw shows up *across* frames: two frames share a keystream, so `C₁ ⊕ C₂ = P₁ ⊕ P₂`. That's why Eve needs the XOR and keystream views for it.

**11. How does CBC fix ECB?**
**Each plaintext block is XORed with the previous ciphertext block (the first with a random IV) before encryption, so equal plaintext blocks give different ciphertext.** The IV must be unpredictable. CBC needs padding (PKCS#7), which is why our CBC frames are 16 bytes longer.

**12. How does CTR mode work?**
**AES encrypts a counter (nonce, nonce+1, …) to make a keystream, and ciphertext = plaintext XOR keystream.** It turns AES into a stream cipher: no padding, parallelisable, and decryption uses AES encryption too.

**13. What exactly goes wrong when a CTR nonce is reused?**
**Both messages are XORed with the same keystream K, so `C₁ ⊕ C₂ = P₁ ⊕ P₂`: K cancels.** If one plaintext is known (our public "Connecting" test card), `K = C₀ ⊕ P₀`, and then every frame decrypts as `P = C ⊕ K`. It is a two-time pad.

**14. Why is the "Connecting…" screen realistic?**
**Real protocols are full of known or guessable plaintext: fixed headers, file formats, "GET / HTTP/1.1", login pages, video codec headers.** Security definitions (IND-CPA) assume the attacker may know or even choose plaintexts.

**15. What is the difference between an IV and a nonce?**
**Both are non-secret per-message values. A nonce only has to be unique; a CBC IV also has to be unpredictable.** CTR and GCM need uniqueness; CBC needs unpredictability.

**16. Why is GCM's nonce 96 bits?**
**96 bits is GCM's standard, fast path: the nonce is used directly with a 32-bit block counter appended (J₀ = nonce ‖ 0³¹1).** Other lengths are first hashed with GHASH, which is slower and makes collisions more likely. NIST SP 800-38D recommends 96-bit nonces. Ours is `nonceSalt (32 bits, secret, from HKDF) ‖ seq (64 bits)`.

**17. What if the frame counter wraps around?**
**It can't in practice: `seq` is a 64-bit number; at 10 frames per second that's billions of years. The correct rule is to re-key before it could ever wrap.** If it did wrap, GCM nonces would repeat (catastrophic) and the replay check would reject everything. Also, GCM has a limit of 2³² invocations per key with random nonces; we use a counter, and every session gets fresh keys anyway. (The CTR mode's internal block counter uses `length: 64`, and a frame only uses 1,200 blocks, so it never wraps either.)

---

## C. Integrity, MAC, AEAD

**18. Why does the bit-flip attack work?**
**CTR is XOR, so flipping ciphertext bits flips the same plaintext bits: `(C ⊕ M) ⊕ K = P ⊕ M`.** Eve chooses the mask M (a star), so she controls exactly what changes, without the key. This property is called **malleability**.

**19. Does CBC stop bit-flipping?**
**No. CBC is also malleable.** Flipping a bit in ciphertext block i garbles block i and flips the same bit in plaintext block i+1. Bob still accepts the damaged frame. Only a MAC stops it.

**20. What is a MAC? What is HMAC?**
**A MAC is a short tag computed from the message and a secret key; without the key nobody can produce a valid tag for a modified message.** HMAC (RFC 2104) builds a MAC from a hash: `HMAC(K, m) = H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m))`. We use HMAC-SHA256 (32-byte tag).

**21. Why encrypt-then-MAC and not MAC-then-encrypt?**
**With encrypt-then-MAC the receiver checks the tag over the ciphertext first and never decrypts forged data.** MAC-then-encrypt forces decryption before verification, which created padding-oracle attacks (e.g. Lucky13 on TLS). Encrypt-then-MAC is provably secure in general (Bellare–Namprempre).

**22. Why does your MAC cover the header too?**
**So Eve can't change `seq`, `mode` or the IV without being caught.** If `seq` weren't authenticated, she could renumber old frames and defeat the replay check.

**23. What is AEAD? Why use GCM instead of CTR + HMAC?**
**AEAD = Authenticated Encryption with Associated Data: one primitive gives confidentiality plus integrity of the ciphertext and of extra unencrypted data (our header).** GCM is standard, fast (hardware support), has one key and a 16-byte tag, and is harder to misuse than a hand-made composition. Both are secure here; our bench shows GCM is also the fastest mode.

**24. Why separate keys for AES and HMAC?**
**Using one key for two different algorithms can let one leak information about the other; key separation is a basic rule.** HKDF gives us independent-looking keys from one secret.

---

## D. Replay

**25. Why doesn't a MAC alone stop replay?**
**A MAC proves who made a message, not when. A recorded frame is still a genuine frame with a valid tag.**

**26. How does your replay protection work?**
**Every frame has a `seq` number in its authenticated header. Bob accepts a frame only if the tag is valid and `seq > lastSeq`**, and then sets `lastSeq = seq`. Replayed frames have old numbers, and Eve can't change the number without breaking the tag.

**27. What about frames that arrive out of order or get lost?**
**Lost frames are fine (gaps are allowed). Out-of-order frames would be rejected by our strict rule.** Over a WebSocket (TCP) order is guaranteed. Over UDP, protocols like IPsec and DTLS use a sliding replay window (e.g. 64 numbers) instead.

**28. Can Eve still block the call?**
**Yes. Cryptography can't prevent denial of service: Eve can drop, delay or corrupt frames.** What she can't do in secure mode is make Bob *accept* anything fake or old. Bob's video freezes and he sees red alerts, so he knows he is under attack.

---

## E. Key exchange, HKDF, MITM, safety numbers

**29. How do Alice and Bob agree on a key?**
**ECDH on the P-256 curve.** Each makes a fresh key pair per session and sends the 65-byte public key in a `hello` message. Each computes `ECDH(myPrivate, theirPublic)`, and both get the same 32-byte secret because `a·(b·G) = b·(a·G)`.

**30. Why ECDH P-256 and not RSA or classic Diffie-Hellman?**
**P-256 gives ~128-bit security with 32-byte keys, it's fast, and it's built into every browser's Web Crypto.** Classic DH needs ~3072-bit numbers for the same security. Fresh key pairs per session also give **forward secrecy**: stealing a laptop later doesn't decrypt old calls.

**31. What is HKDF for?**
**It turns the raw ECDH secret into several strong, independent keys (AES key, MAC key, nonce salt).** The ECDH output isn't uniformly random (it's a curve coordinate), so we "extract" first and then "expand" (RFC 5869). Salt = SHA-256(session id) gives fresh keys for every session; info = "CipherCam v1 keys" binds them to our protocol.

**32. Why doesn't AES-GCM stop the MITM?**
**GCM only proves a frame came from someone who has the key. In a MITM, Eve *has* the key, because Alice and Bob each did ECDH with Eve.** The cryptography works perfectly; it's just talking to the wrong person. The problem is authentication of the key exchange, not encryption.

**33. How does the MITM work exactly?**
**The relay replaces Alice's public key with Eve's key E2 before passing it to Bob, and Bob's key with E1 before passing it to Alice.** Alice shares `k_AE` with Eve, Bob shares `k_EB` with Eve. Eve decrypts each frame with `k_AE`, reads it, re-encrypts it with `k_EB` with the same `seq`, and forwards it. Every tag and counter is valid.

**34. What is a safety number, and why does it catch Eve?**
**A fingerprint of both public keys: SHA-256("CipherCam safety" ‖ smaller key ‖ larger key), shown as 12 digits.** Normally both sides fingerprint the same two keys and get the same number. Under MITM, Alice fingerprints (A, E1) and Bob (E2, B), so the numbers differ. Alice and Bob compare them out-of-band (reading aloud, in person). Signal and WhatsApp do exactly this.

**35. Why sort the two keys before hashing?**
**So both sides compute the same number regardless of who is "first".**

**36. 12 digits is only about 40 bits. Is that enough?**
**For a human check against a live attacker, yes.** Eve would have to find her own key pairs whose fingerprints collide with Alice's and Bob's view *while the call is being set up*, a targeted second-preimage search of roughly 2⁴⁰ work per session. Signal uses 60 digits for long-term identity keys. You can make it longer at the cost of usability.

**37. How else could the key exchange be authenticated?**
**Certificates and a PKI (like TLS), pre-shared keys, signed keys (e.g. a long-term identity key signing the ECDH key), or a PAKE with a shared password.**

**38. Why does the "out-of-band" check use a BroadcastChannel in the demo?**
**It stands in for a channel Eve doesn't control: reading the numbers aloud, or meeting in person.** The relay (Eve) never sees it, because it goes directly between the pages on the laptop. That's what "out-of-band" means.

---

## F. Implementation

**39. Why Web Crypto and not your own AES?**
**Never roll your own crypto: Web Crypto is a standard, audited, constant-time native implementation.** We only use the `aes-js` library for ECB, because Web Crypto deliberately doesn't offer ECB. We cross-check everything against OpenSSL (`npm test`) and FIPS-197.

**40. How did you test it?**
**`npm test`: 48 unit/integration tests**, including OpenSSL cross-checks for every mode, FIPS-197, attack properties (ECB leak > 50%, `C₁⊕C₂ = P₁⊕P₂`, bit-flip = original ⊕ mask, replays rejected, MITM detected), and the real server with simulated clients. **`npm run e2e`**: Playwright drives the real Stage in Chromium through every step at two resolutions. **`npm run bench`** measures every mode. **`npm run soak`**: a 10-minute auto-play loop.

**41. What overhead does security add?**
**GCM adds 28 bytes per frame (12-byte nonce + 16-byte tag) on 19,200 bytes, about 0.15%, and is actually the fastest mode in our benchmark (~0.1 ms per frame).** See `docs/results/RESULTS.md`.

**42. What are the limitations?**
**The video is tiny (160×120, 4 grey levels) so the ECB leak is visible; the relay is a trusted laptop process playing Eve; the safety-number channel is simulated; there is no audio, no NAT traversal and no long-term identity keys.** Real systems (WebRTC + SRTP/DTLS, Signal) use the same ideas at full scale.

**43. How is this different from real video calls (WebRTC)?**
**WebRTC encrypts media with SRTP (AES-CTR/AES-GCM with per-packet sequence numbers and authentication tags) and authenticates the DTLS key exchange with certificate fingerprints.** That's exactly our step-6 fix (AEAD + counter) plus step-8 fix (fingerprints). End-to-end encrypted calls add safety-number verification on top.
