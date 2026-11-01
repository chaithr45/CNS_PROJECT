# CipherCam: complete build brief

You are building **CipherCam** from an empty repository, start to finish, until it is demo-ready. Work autonomously through every phase below. The person who asked for this is not watching, so don't stop to ask questions. Make a sensible decision, write it in the Decision log in `PROGRESS.md`, and keep going. Stop only if you are truly blocked (for example, you cannot push to git). In that case, write the blocker into `PROGRESS.md` first.

---

## 0. Context: who this is for and what "done" means

- **Student:** Aravapalli Sai Chaithr Choudary (23ECB0A20), B.Tech ECE, NIT Warangal.
- **Course:** EC 425 Cryptography and Network Security. Instructor: Dr. Sourabh Solanki.
- The student will present this **live in a classroom with a projector**, from his own **Windows laptop** (Chrome or Edge). A Mac may be used instead.
- He is **not confident with cryptography or coding**. Everything must therefore be:
  - simple to start (double-click a file),
  - impossible to get lost in (a scripted demo with captions),
  - fully explained in plain English (for the viva).
- The demo must work **offline** once `npm install` has run. There must be no CDN, no Google Fonts and no internet calls at runtime.
- His slides already promise the content below. Keep these names and claims exactly:
  - **CipherCam**: a live encrypted video call in the browser. Alice sends, Bob receives, and Eve is the attacker sitting in the relay (like a hacked Wi-Fi router).
  - **Five attacks and five fixes:**

    | # | Attack | Fix |
    |---|---|---|
    | 1 | ECB pattern leak | Randomized mode (CBC/CTR, fresh IV) |
    | 2 | CTR nonce reuse | Unique nonce for every frame |
    | 3 | Bit-flipping | MAC: HMAC-SHA256 or AES-GCM |
    | 4 | Replay ("CCTV loop") | Frame counter covered by the MAC |
    | 5 | Key-exchange MITM | Safety-number check |

  - **Tech:** Web Crypto API (AES-CBC, AES-CTR, AES-GCM, HMAC-SHA256, ECDH P-256) plus `aes-js` for AES-ECB, which Web Crypto deliberately omits. A Node.js WebSocket relay. Frames are 160×120 grayscale at 10 fps, about 190 KB/s.
  - **Syllabus coverage:**
    - Unit 1: attacks and security services.
    - Unit 2: AES and block cipher modes.
    - Unit 3: ECDH.
    - Unit 4: MACs, HMAC, authentication and replay.
  - **Final demo flow:**
    1. Normal call, where Eve sees gibberish.
    2. ECB leaks the silhouette.
    3. CTR nonce reuse.
    4. A bit-flip stamps a star onto Bob's video.
    5. The CCTV loop.
    6. Secure mode rejects every attack.
    7. Finale: a MITM caught by mismatched safety numbers.

**Done means all of these are true:**

- A fresh clone followed by `npm ci`, `npm test` and `npm run e2e` all pass.
- `npm run demo`, or double-clicking `start-demo.bat` on Windows, opens the Stage page, and every demo step works with both the synthetic video source and a webcam.
- Every document in section 15 exists and is accurate.
- `PROGRESS.md` shows every phase ticked, with evidence for each.

---

## 1. Handoff-safe working rules (follow strictly)

The session may stop at any moment. Another Claude session, or the student, must be able to continue exactly where you left off.

1. **First action, before anything else:**
   1. Save this entire prompt verbatim as `docs/SPEC.md`.
   2. Create `CLAUDE.md` and `PROGRESS.md` (templates below), plus `README.md` (a skeleton is fine) and `.gitignore`.
   3. Commit and push.
2. **At the start of every session**, including a resumed one:
   1. Read `CLAUDE.md`, `PROGRESS.md` and `docs/SPEC.md`.
   2. Run `git log --oneline -15` and `npm test` (if tests exist yet).
   3. Continue from **NEXT STEP** in `PROGRESS.md`.
3. **After every task** (the P-numbered items in section 16):
   1. Verify it: run the tests, take a screenshot, or check the output.
   2. Tick it in `PROGRESS.md`, noting how you verified it.
   3. Update **NEXT STEP**.
   4. Commit with the message `P<id>: <what>` and push.

   Never tick anything you haven't verified.
4. **If you sense your context or time running out:** stop starting new work, write a precise handoff into `PROGRESS.md` (what is half done, which file and function, what to do next), then commit and push.
5. **If something in this spec is technically wrong or impossible**, fix it the best way you can and record the change in the Decision log. Don't silently drop features.
6. Push to the session's branch and never force-push. Keep `package-lock.json` committed. Pin exact dependency versions.

**`CLAUDE.md` content** (auto-loaded by future Claude sessions):

- One paragraph saying what CipherCam is.
- "ALWAYS read PROGRESS.md and docs/SPEC.md first and continue from NEXT STEP."
- The working rules above, in short.
- The command list: `npm test`, `npm run e2e`, `npm run demo`, `npm run bench`.
- The folder map.
- These constraints: vanilla JS, no build step, no CDN, Windows-first, offline.

**`PROGRESS.md` template:**

```markdown
# CipherCam — Progress & Handoff
Last updated: <date/time> — <short session note>

## Status
<one line: e.g. "Phase 3 in progress — Eve passive views done, leak meter next">

## NEXT STEP
<exact next action: file, function, what "done" looks like>

## Checklist
- [x] P0.1 Repo scaffold … (verified: <how>)
- [ ] P1.1 …
(full list mirrored from SPEC section 16)

## How to check the current state
<commands to run and what you should see>

## Decision log
- <date> <decision> — <why>

## Known issues / open questions

## Session log (newest first)
- <date> <what was done, what's next>
```

---

## 2. The story the demo tells

AES itself is never broken during the demo. Every failure comes from *how* AES is used. Each attack is shown live, through Eve's eyes, and then shown being defeated:

1. **ECB:** identical 16-byte blocks produce identical ciphertext, so Eve sees the outline of the person.
2. **Nonce reuse in CTR:**
   - Two frames encrypted with the same keystream XOR into the XOR of their plaintexts.
   - If Eve also knows one plaintext frame (the public "Connecting…" test card every call starts with), she recovers the keystream and watches the whole call in the clear.
3. **Bit-flipping:** CTR is XOR, so flipping ciphertext bits flips the same pixel bits. Eve stamps a star onto Bob's video without ever knowing the key.
4. **Replay:** Eve records old, perfectly valid frames and loops them. Bob keeps seeing the person after they have left the room.
5. **Secure mode** (AES-GCM with an authenticated, strictly increasing frame counter): tampered frames fail the tag check, and replayed frames fail the counter check. Bob shows red alerts. Eve can block the call but can never fake it.
6. **MITM finale:** even AES-GCM falls if the keys are not authenticated. Eve swaps the ECDH public keys and decrypts everything. The safety numbers on Alice's and Bob's screens no longer match, which exposes her.

---

## 3. Tech stack and hard constraints

- **Node.js 20 or newer** (22 LTS recommended). Plain ES modules (`"type": "module"`).
- **No TypeScript, no bundler, no frontend framework.** Use vanilla HTML, CSS and JS so the student can read and explain every line.
- **Dependencies, kept minimal:** `ws` and `aes-js` (v3), `qrcode` for QR SVGs and terminal QR, and `@playwright/test` as a dev dependency. Anything more must be justified in the Decision log.
- **Browser libraries** are served from the local server (e.g. `/vendor/aes-js/index.js` mapped from `node_modules`). Nothing comes from the internet at runtime. Use system fonts only.
- **Shared code:** the code in `shared/` runs in both the browser and Node.
  - It uses `globalThis.crypto.subtle` and `globalThis.crypto.getRandomValues`, which both environments have.
  - It must not touch Node-only or browser-only globals at import time.
  - ECB is injected:
    - `shared/ecb.js` exports `setAesJs(lib)`.
    - The browser calls it with `window.aesjs`, loaded through a classic `<script>` tag.
    - Node calls it with `createRequire(import.meta.url)('aes-js')`.
- **Secure context:** Web Crypto and `getUserMedia` need HTTPS or `localhost`.
  - Alice, Bob, Eve's control panel and the Stage therefore always run on the presenter's laptop at `http://localhost:<port>`.
  - Audience phones only open `/watch`, which must need **no** `crypto.subtle` and no camera. It uses pure-JS rendering and XOR only.
  - Any page that needs Web Crypto must show a clear full-width banner if `!window.isSecureContext`, saying "Open this page via http://localhost:PORT on the presenter laptop".
- **Windows first.**
  - Use no bash-only commands in npm scripts and build paths with `path.join`.
  - Include `start-demo.bat`. It should:
    1. `cd` to the script's own folder.
    2. Check for Node and, if missing, print "Install Node.js LTS from nodejs.org" and pause.
    3. Run `npm install` if `node_modules` is missing.
    4. Run `npm run demo`.
  - Include `start-demo.command` (macOS) and `start-demo.sh` (Linux). Make both executable.
- **Opening the browser:** `npm run demo` starts the server and opens the default browser at `/stage` (via `start`, `open` or `xdg-open` depending on platform). `--no-open` disables this.
- **Ports:** default 8080. If it's busy, try 8081–8090 and print the one actually used.
- **Startup banner** in the terminal should show:
  - the Stage URL,
  - all LAN IPv4 URLs for `/watch`, with a terminal QR code for the first non-internal one,
  - "Press Ctrl+C to stop".
- **Remote control is locked down:** control messages (mode changes, attacks, demo steps) are accepted only from clients connecting from localhost (`127.0.0.1` or `::1`). The `--allow-remote-control` flag lifts this. Watchers on phones can never control anything.

---

## 4. Architecture

```
 Alice page ──WS──►  RELAY SERVER (Node)  ──WS──► Bob page
 (webcam, encrypt)   = "the network"            (verify, decrypt)
                     Eve's ACTIVE attacks live here:
                     bit-flip, replay loop, MITM
                         │ copies of every frame
                         ▼
                Eve page / Stage / /watch phones
                (PASSIVE analysis in the viewer: raw bytes,
                 ECB block colours, XOR views, keystream recovery)
```

- **The server** owns a single `state` object, the source of truth, and broadcasts it to every client whenever it changes. The state holds:
  - the current mode and session id,
  - posterize levels and fps,
  - Eve's view mode,
  - the attacks: `bitflip {on, stamp}`, `replay {phase: off|recording|looping, seconds}`, `mitm {on}`,
  - the current demo step,
  - the watcher fps.

  Clients send `control` patches, and the server validates them (localhost-only rule) before applying.
- **Roles** connect to `ws://host/ws?role=alice|bob|eve|watch|stage`. Allow one Alice and one Bob at a time; if a new one connects, the old one is disconnected cleanly.
- **Sender and receiver logic live in `shared/`:**
  - `shared/sender.js`: `buildFrame(session, pixels, seq)` returns `{headerBytes, payload}`.
  - `shared/receiver.js`: `receiveFrame(rxState, headerBytes, payload)` returns `{ok, pixels?, reason?}`.

  The full Alice → relay → Bob pipeline, including every attack, can therefore be tested in Node without a browser.

---

## 5. Video pipeline (tested settings; keep them)

A prototype showed that raw webcam noise destroys the ECB leak once posterization goes above about 4 levels, unless the noise is averaged away first. These settings were tested with real AES-128 at noise σ = 8 and uneven lighting, and the silhouette leaked clearly:

1. **Capture** at 640×480 with `getUserMedia({video: {width: 640, height: 480}})`.
2. **Area-average** each 4×4 pixel group into one pixel to get 160×120 grayscale. Use luma `0.299R + 0.587G + 0.114B`. Do the averaging yourself; don't rely on canvas smoothing.
3. **Smooth over time** with an exponential moving average per pixel: `avg = 0.6*avg + 0.4*new`.
4. **Posterize** to `L` levels. The default is **4**, with a slider for 2–6. Use hysteresis: a pixel keeps its previous level unless the smoothed value moves past the level boundary by more than a margin (default 6, tunable). This prevents flicker. Output values are spread evenly over 0–255 (for L = 4: 0, 85, 170, 255).
5. **Tile layout:** serialize the frame in **4×4 tiles**, so each 16-byte AES block is one 4×4 tile. That gives a 40×30 tile grid and 1,200 blocks, a 19,200-byte payload. Viewers invert the same layout to draw. This makes the ECB silhouette far clearer than row order would.
6. **Frame rate:** 10 fps by default (slider for 5–15). Skip a frame if `ws.bufferedAmount` is above 200 KB.

**Video sources** (a dropdown on Alice; switching to synthetic is automatic if the camera fails, with a toast message):

- **Webcam.**
- **Synthetic scene**, the default for tests and the guaranteed fallback. A deterministic animated scene drawn with pure math (no canvas text):
  - a light wall with a gradient,
  - a window rectangle,
  - a desk,
  - a dark head-and-shoulders silhouette that sways slowly, with an arm that waves now and then.

  The person must be able to "leave the room" (walk out of frame) on command. The replay step needs this.
- **Splash test card:** `makeSplashFrame()` in `shared/frame.js` builds a deterministic 160×120 frame from pure math and a **hard-coded bitmap font**: bars and circles plus the text `CIPHERCAM` / `CONNECTING`. It must be byte-identical everywhere, because Eve reproduces it. **Every session starts with 10 splash frames (1 second) before live video.** This is realistic, like a public "connecting" screen, and it is what makes the keystream-recovery attack possible.

---

## 6. Keys, handshake and safety numbers

- **On session start:**
  1. Alice and Bob each generate an ECDH P-256 key pair.
  2. They exchange `hello {sid, role, pub: base64(raw 65-byte key)}` through the relay.
  3. Each derives `shared = ECDH(priv, peerPub)`, 256 bits.
  4. Each runs HKDF-SHA256 with `ikm = shared`, `salt = SHA-256(utf8(sid))` and `info = "CipherCam v1 keys"`, producing 52 bytes: `aesKey(16) | macKey(32) | nonceSalt(4)`.
  5. Each keeps the raw bytes (ECB needs them) and also imports them as Web Crypto keys.
- **Safety number:** `SHA-256("CipherCam safety" || min(pubA, pubB) || max(pubA, pubB))`, compared byte-wise. Take the first 6 bytes and show them as 12 decimal digits in groups of 4. The result doesn't depend on who computes it.
  - Alice and Bob each display their own computed number in large text.
  - Out-of-band comparison uses a `BroadcastChannel('ciphercam-oob')` between same-origin pages on the laptop, clearly labelled "out-of-band check (like reading the numbers aloud)".
  - The Stage shows a large ✓ MATCH in green or ✗ MISMATCH in red.
- **When a session restarts:** a new `sid` and new keys are generated, `seq` resets to 0, and the 10 splash frames go first.
  - Restarts happen on: every mode change, the Restart button, Alice or Bob (re)connecting, and toggling MITM (which requires a restart).
  - Make restarts quick (under 1 second) and robust to message ordering, e.g. Bob joining after Alice. Alice re-sends `hello` when the server reports `peer-joined`.

---

## 7. Modes (set on Alice, written into every frame header)

| id | Label shown | Encrypt | Bob's checks |
|---|---|---|---|
| `plain` | No encryption | none | none |
| `ecb` | AES-ECB | aes-js ECB per 16-byte block | none |
| `cbc` | AES-CBC (random IV) | Web Crypto AES-CBC, fresh random 16-byte IV per frame (Web Crypto adds a 16-byte PKCS#7 padding block) | none |
| `ctr` | AES-CTR (random nonce) | Web Crypto AES-CTR, fresh random 16-byte counter block per frame, `length: 64` | none |
| `ctr-reuse` | AES-CTR — BUG: nonce reused | the same counter block for every frame of the session (random at session start) | none |
| `ctr-hmac` | CTR + HMAC (Encrypt-then-MAC) | CTR as above, then `tag = HMAC-SHA256(macKey, headerBytes ‖ ciphertext)` (32 bytes) | verify tag (`subtle.verify`), then require `seq > lastSeq` |
| `gcm` | AES-GCM (secure) | Web Crypto AES-GCM, 12-byte nonce `= nonceSalt(4) ‖ seq(8, big-endian)`, `additionalData = headerBytes`, 128-bit tag | tag (decrypt throws if tampered), then require `seq > lastSeq` |

- **Insecure modes** (`plain`, `ecb`, `cbc`, `ctr`, `ctr-reuse`): Bob displays anything that decrypts and does no sequence check. That is the point.
- **Payload layout:** `ciphertext ‖ tag`, where the tag length is 16 for `gcm`, 32 for `ctr-hmac` and 0 otherwise. Viewers render only the first 19,200 bytes.
- **Comments:** explain every crypto line in plain English. The student must be able to read the code aloud.

---

## 8. Wire protocol

- **Every WebSocket message is binary:**
  `[u32 BE headerLen][header JSON, UTF-8][payload bytes]`.
  The header bytes are exactly what `ctr-hmac` and `gcm` authenticate, so Bob uses the bytes he received, not re-serialized JSON.
- **Frame header:** `{t:"frame", sid, seq, mode, iv (base64 or null), w:160, h:120, levels, ts}`.
- **Other message types:**
  - `hello`
  - `state`, broadcast by the server
  - `control` (patch)
  - `restart`
  - `peer-joined`
  - `event` (a log line for the Stage)
  - `eve-plain` (frames Eve decrypted during MITM, sent to Eve and watchers only)
- **Watchers** (`/watch`) receive frames throttled to `state.watchFps` (default 4). The server drops frames for any slow client (`bufferedAmount` check) and caps watchers at 40. A phone hotspot can't carry 30 phones × 190 KB/s.

---

## 9. Eve

### Passive views

These are rendered in `eve.html` and `watch.html`. They need no keys and no `crypto.subtle`. The view is chosen by `state.eveView`, and Eve's panel can change it.

1. **Raw ciphertext:** bytes drawn as grayscale pixels, using the inverse tile layout.
2. **Block colours:** each 16-byte ciphertext block becomes a 4×4 swatch coloured by its first 3 bytes, so identical blocks get identical colours. This is the strongest ECB visual.
3. **XOR with previous frame:** `C_now ⊕ C_prev`. Non-zero bytes are drawn white and zero bytes black, so motion appears.
4. **Keystream recovery:**
   1. Eve stores the frame with `seq 0` of the session, which is the splash.
   2. She computes `K = C0 ⊕ makeSplashFrame()`.
   3. For every later frame **with the same IV**, she shows `C ⊕ K`.
   4. When IVs differ, she shows "No reuse detected — attack fails".

**Leak meter** (always visible): the percentage of ciphertext blocks in the current frame that are duplicates of another block in the same frame. ECB should read high; every other mode should read about 0%. Log it as a result.

**Nonce-reuse detector:** if the IV in a frame header repeats an earlier one in the same session, flash "⚠ NONCE REUSED (same IV as frame #0)". The view switches automatically to keystream recovery only when a demo step requests it.

**MITM view:** while MITM is on and Eve holds the keys, show the `eve-plain` frames with a red banner, "EVE HAS THE KEY".

### Active attacks (server relay: `server/eve-active.js`)

- **Bit-flip stamp:**
  - Eve's panel rasterizes the chosen stamp (★ star, the word HACKED, or a smiley) on a canvas, converts it to the tile layout and sends it as a 19,200-byte mask.
  - The relay XORs `0xFF` into the ciphertext bytes under the mask, for every frame going to Bob.
  - The tag is never touched, so `gcm` and `ctr-hmac` reject the frame.
  - In `cbc`, never touch the last 32 bytes, to avoid a padding error. Bob still handles decryption errors gracefully, with a red "decryption error" counter.
  - In `ecb`, the stamped tiles turn into garbage, which is fine and still proves there is no integrity.
- **Replay ("CCTV loop"):**
  - **Record** captures N seconds (default 5) of frames: header bytes, payload and relative time.
  - **Loop** drops live frames to Bob and replays the recording on a loop at the original timing.
  - **Stop** returns to live.
  - In `gcm` and `ctr-hmac`, Bob rejects the looped frames with "REPLAY: seq 37 ≤ last 212" and keeps the last good frame, with a red alert. The video freezes; Bob is never fooled.
- **MITM** (takes effect on the next session restart):
  1. The relay replaces Alice's `hello.pub` with Eve's key E1 and Bob's `hello.pub` with Eve's key E2.
  2. Eve derives `k_AE` (with Alice) and `k_EB` (with Bob).
  3. For every frame from Alice, the relay decrypts with `k_AE` using the shared receiver logic (no checks), sends the plaintext to Eve and the watchers as `eve-plain`, then re-encrypts with `k_EB` in the same mode and with the same `seq` (shared sender logic) and forwards it to Bob.

  Bob accepts these frames, even in `gcm`. Only the safety numbers expose Eve.

---

## 10. Bob

- Decrypts according to `header.mode` and applies the checks in the table in section 7.
- **On success:** draws the frame. Shows mode, latency (`now − ts`), fps and accepted count.
- **On failure:** keeps the last good frame, flashes a red alert with the reason ("TAMPERED FRAME REJECTED (tag mismatch)", "REPLAY REJECTED (seq …)", "DECRYPTION ERROR"), and increments counters per reason.
- Shows an "Integrity: OFF/ON" badge (ON for `gcm` and `ctr-hmac`) and the safety number.
- Has a **Download stats CSV** button with one row per second: mode, fps, latency, accepted, rejected by reason.

---

## 11. Pages and UI

All pages share `public/css/app.css`. The style is clean and dark, with large text that reads on a projector (minimum 18 px on the Stage). Colours: Alice blue, Bob green, Eve red. Colour is never the only signal; use icons and words too.

| Page | Purpose |
|---|---|
| `/` | Landing page: links to every page, a QR code for `/watch` using the chosen LAN IP (with a dropdown when there are several), and a big "Open Stage" button. |
| `/stage` | **The projector view.** Three panels side by side, each an iframe (`?embed=1`, `allow="camera"`): **Alice** (camera preview), **Eve** ("What the attacker sees"), **Bob** (received video). Under them: the mode, the safety numbers plus ✓/✗ comparison, Bob's alert area and a live event log (last 8 lines). A **Demo steps** sidebar (section 12) and a **caption bar** in big text explaining the current step in one sentence, with the formula where relevant (e.g. `C₁ ⊕ C₂ = P₁ ⊕ P₂`). Must fit 1366×768 and 1920×1080 without scrolling. |
| `/alice` | Source selector, mode selector, levels and fps sliders, camera preview, "Person leaves the room" toggle for the synthetic source, safety number, a Restart button and **Camera tuning** tips. |
| `/bob` | As described in section 10. |
| `/eve` | View selector, leak meter, attack controls (stamp picker, Record/Loop/Stop, MITM toggle with a "takes effect on restart" note) and an explanation box. |
| `/watch` | Phone audience view: Eve's current view only, full screen, read-only, plus a short caption. Must work from `http://<LAN-IP>:<port>/watch` (not a secure context). |
| `/selftest` | Runs known-answer tests in the browser (section 14) and shows PASS/FAIL per primitive. |

**Keyboard shortcuts on the Stage:**

| Key | Action |
|---|---|
| `→` / `←` | Next / previous demo step |
| `1`–`9` | Jump to that step |
| `R` | Reset everything to step 1, attacks off, fresh session |
| `A` | Auto-play the whole demo with captions (rehearsal or backup) |
| `F` | Hide the controls for a clean projector view |

Show a small "?" help overlay listing the keys.

---

## 12. Demo autopilot steps

Define these in `shared/steps.js` and use them for both the Stage sidebar and `DEMO_GUIDE.md`. Each step sets the full configuration (mode, Eve view, attacks, restart or not) and a caption. Any step must be reachable from any other step without leftover state.

| # | Title | Configuration | Caption idea |
|---|---|---|---|
| 0 | Plain video (optional) | `plain`, Eve raw | "No encryption: anyone on the Wi-Fi sees you." |
| 1 | Encrypted call | `ctr`, Eve raw | "Encrypted with AES-CTR: Eve sees pure noise. But is it secure?" |
| 2 | ECB leaks the shape | `ecb`, Eve block colours, leak meter highlighted | "Same pixels in, same ciphertext out — your outline leaks." |
| 3 | Nonce reuse | `ctr-reuse`, Eve keystream recovery | "Same keystream twice + one known frame = Eve watches without the key." |
| 4 | Bit-flipping | `ctr`, bit-flip ★ on | "Eve flips ciphertext bits → the same pixels flip on Bob's screen." |
| 5 | CCTV loop | `ctr`, replay. The step runs: record 5 s with a big countdown ("wave now!"), then the synthetic person leaves (or the presenter steps away), then loop | "Old frames are still valid frames. Bob sees the past." |
| 6 | Secure mode | `gcm`. Sub-actions on the Stage: "Try bit-flip" (rejected), "Try replay" (rejected), Eve raw (noise), leak meter about 0% | "AES-GCM + frame counter: tampering and replays are caught." |
| 7 | MITM finale | `gcm`, MITM on, restart | "Eve swapped the keys: she sees everything, but the safety numbers don't match." |
| 8 | Verified keys | `gcm`, MITM off, restart, numbers match, Eve back to noise | "Checking the safety number defeats the man-in-the-middle." |

---

## 13. Reliability requirements

- Every WebSocket client auto-reconnects with backoff and shows a small connection indicator. A reload of Alice or Bob triggers a clean session restart.
- No unhandled promise rejections. Wrap crypto in `try/catch` and show errors in the UI.
- The server keeps running when any client disconnects mid-frame, and logs events.
- **Soak test:** auto-play loops for 10 minutes with no console errors and no steady memory growth (check `performance.memory` in Chromium, or the heap size from the server).
- At least 10 fps sustained with all three Stage panels open, on a mid-range laptop. Measure it in the e2e run and record it.
- No external URLs in the served pages. Add a test that greps `public/` and `shared/` for `http://` and `https://`, allowing comments and docs only.

---

## 14. Testing (required evidence, all wired into npm scripts)

### `npm test` (node:test, no browser)

- Tile layout round-trips exactly. Posterize with hysteresis behaves as expected. The splash frame is deterministic.
- Each mode round-trips: `buildFrame` then `receiveFrame` gives back the original pixels.
- **Cross-checks against `node:crypto` (OpenSSL)** as an independent implementation, for ECB, CBC, CTR, GCM and HMAC-SHA256: identical ciphertexts and tags for the same key, IV and plaintext.
- The FIPS-197 Appendix C.1 AES-128 vector: key `000102…0f`, plaintext `00112233445566778899aabbccddeeff` gives `69c4e0d86a7b0430d8cdb78070b4c55a`.
- **Attack properties:**
  - ECB: the leak meter is above 50% on the synthetic frame, and about 0% for `cbc`, `ctr` and `gcm`.
  - `ctr-reuse`: `C1 ⊕ C2 = P1 ⊕ P2`, and keystream recovery reproduces the live frame exactly.
  - Bit-flip in `ctr`: Bob's output is the original XOR the mask.
  - Bit-flip in `gcm` and `ctr-hmac`: rejected for tag failure.
  - Replay in `ctr`: accepted. In `gcm` and `ctr-hmac`: rejected for replay.
  - MITM: Bob decrypts successfully, Eve's plaintext equals Alice's, and the safety numbers mismatch. Without MITM they match.
- **Integration:** start the server in-process, connect Node `ws` clients acting as Alice and Bob using the shared sender and receiver, toggle each attack through control messages and assert the outcomes. Also check that control messages from a non-localhost address are refused (simulate it via a header or socket address in the test).

### `npm run e2e` (Playwright, Chromium)

- Launch with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
- Run the whole autopilot on `/stage` with the synthetic source.
  - Assert each step's expected state through a debug hook, `window.__ciphercam`, which exposes counters, the current step, Bob's last status, the leak meter and the safety-number match.
  - Save screenshots at 1366×768 and 1920×1080 to `docs/screenshots/step-<n>-<w>.png`.
- Run one pass with the fake camera source.
- Load `/watch` via the container's non-loopback IP (not a secure context) and assert it renders frames.
- **Look at the screenshots yourself** before ticking a task. Check for overlaps, unreadable text, and whether each step clearly shows what its caption claims, especially that the ECB silhouette is obvious. Tune the defaults if not.

### Backup video

Record the auto-play run with Playwright video and save it as `docs/backup-demo.webm` (convert to mp4 with ffmpeg if available), under 25 MB. This is the student's plan B if the live demo fails.

### `npm run bench`

For each mode, in Node, time 1,000 frames of encrypt and decrypt, and record:

- ms per frame,
- MB/s,
- overhead bytes per frame (IV and tag),
- the leak-meter value on synthetic frames,
- the reject rate under each attack.

Write the results to `docs/results/bench.csv` and `docs/results/RESULTS.md` (a table plus 3–4 sentences of interpretation).

### `/selftest`

Generate the vectors once with `node:crypto` into `test/vectors.json` (and include the FIPS-197 vector). The browser self-test checks the Web Crypto and aes-js paths against them.

**In the cloud you cannot test a real webcam.** Make the fake camera and synthetic paths solid, and put real-camera tuning steps in `DEMO_GUIDE.md`.

---

## 15. Documentation deliverables

Write these for a smart student who is new to crypto: plain English, short sentences.

1. **`README.md`:** what CipherCam is, with one screenshot.
   - **Quick start for Windows:**
     1. Install Node.js LTS from nodejs.org.
     2. Download the ZIP from GitHub or `git clone` the repo.
     3. Double-click `start-demo.bat`.
     4. Chrome or Edge opens the Stage.
   - Quick start for macOS.
   - The command list, the folder map and links to every doc.
2. **`PROGRESS.md`:** kept current throughout (section 1).
3. **`CLAUDE.md`:** section 1.
4. **`docs/DEMO_GUIDE.md`, the most important document.** A step-by-step guide to giving the live demo:
   - **What you need:** laptop and charger, HDMI adapter, optional phone hotspot.
   - **Setup diagrams.**
     - **(A) Recommended:** laptop plus projector only, with everything on localhost.
     - **(B) Optional bonus:** audience phones on `/watch`.
       - The laptop and the phones join the same hotspot. Better: the laptop runs Windows Mobile Hotspot and the phones join it.
       - Allow Node through Windows Firewall on private networks.
       - College Wi-Fi often blocks device-to-device traffic, so don't rely on it.
   - **Checklists:** the night before, 30 minutes before and 5 minutes before. These cover:
     - running `npm test`,
     - auto-playing once,
     - charging the laptop,
     - closing heavy apps,
     - display mode (Duplicate is simplest),
     - browser zoom at 100%,
     - camera permission,
     - lighting and a plain wall behind you,
     - a dark shirt (it helps the ECB leak),
     - having the backup video ready.
   - **For each step 0–8:**
     - **Press** (the exact key or click),
     - **Say** (2–3 sentences to speak, word for word),
     - **The audience sees** (what appears, with the screenshot embedded from `docs/screenshots`),
     - **If it doesn't work** (a quick fix).
   - **Timing plan:** about 6–8 minutes in total.
   - **Recovery playbook:**
     - `R` to reset,
     - restarting the server,
     - switching to the synthetic source,
     - reloading a panel,
     - finally, playing `docs/backup-demo.webm`.
   - A 60-second elevator pitch.
   - **Camera tuning:** the levels slider, lighting, distance from the camera, plain background, and what a good ECB leak looks like.
5. **`docs/DEMO_CHEATSHEET.md`:** one printable page with the keys, the steps, and a one-line "say this" per step.
6. **`docs/EXPLAINED.md`:**
   - Each concept explained simply, with an analogy, a tiny worked example and pointers to the exact code (file:function): AES, block modes (ECB/CBC/CTR/GCM), IV/nonce, XOR, keystream, malleability, MAC/HMAC, Encrypt-then-MAC, AEAD, replay, ECDH, HKDF, MITM, safety numbers.
   - Why the frames are posterized and tiled.
   - What each attack proves.
7. **`docs/VIVA_QA.md`:** 30 or more likely examiner questions with short, correct answers. For example:
   - "If AES is secure, why does ECB leak?"
   - "Why does GCM not stop MITM?"
   - "Why a 96-bit nonce?"
   - "What if the counter wraps?"
   - "Is this a real attack?"
   - "Why encrypt-then-MAC and not MAC-then-encrypt?"
   - "Why ECDH P-256?"
   - "What's HKDF for?"
   - "Can Eve still block the call?"
8. **`docs/ARCHITECTURE.md`:** components, the message formats, a sequence diagram of the handshake (normal and MITM) and the frame flow, all as Mermaid, plus the state model.
9. **`docs/REPORT_DRAFT.md`:** a project report draft:
   - abstract,
   - introduction and motivation,
   - background (the syllabus mapping to Units 1–4 and CO1–CO3),
   - design,
   - implementation,
   - attack lab results, using real numbers from `docs/results` and screenshots,
   - limitations,
   - conclusion and references (FIPS-197, NIST SP 800-38A, SP 800-38D, RFC 2104, RFC 5869, the Stallings textbook).

---

## 16. Phases and tasks (in order; mirror these IDs in `PROGRESS.md`)

### P0 Setup

- **P0.1** Save the spec; create `CLAUDE.md`, `PROGRESS.md`, the README skeleton, `.gitignore` and `package.json` (scripts: `start`, `demo`, `test`, `e2e`, `bench`). Install dependencies. Commit and push.

### P1 Shared core

- **P1.1** `shared/frame.js`: area downscale, EMA, posterize with hysteresis, the tile layout and its inverse, the splash test card with the bitmap font, the synthetic animated scene (with "leave the room"), and the leak meter.
- **P1.2** `shared/crypto.js` and `shared/ecb.js`: ECDH, HKDF, the safety number, all 7 modes.
- **P1.3** `shared/protocol.js`, `shared/sender.js` and `shared/receiver.js`.
- **P1.4** The unit tests from section 14 for P1. `npm test` must be green.

### P2 Live call

- **P2.1** `server/`: static serving (`public/`, `/shared`, `/vendor`), the WebSocket relay, the state, the localhost-only control rule, port fallback, the startup banner with QR codes, and `npm run demo` opening the browser.
- **P2.2** `/alice`: sources, modes, sliders, the safety number, restart.
- **P2.3** `/bob`: decrypt, checks, alerts, counters, CSV.
- **P2.4** Playwright smoke test: Bob shows frames in every mode. Add screenshots.

### P3 Eve (passive)

- **P3.1** `/eve`: the four views, the leak meter, the nonce-reuse detector, keystream recovery.
- **P3.2** `/watch` (throttled, read-only, works without a secure context) and QR codes on `/` and `/stage`.

### P4 Eve (active)

- **P4.1** Bit-flip stamps.
- **P4.2** Replay record and loop.
- **P4.3** MITM.
- **P4.4** Integration tests for all of the above.

### P5 Stage and autopilot

- **P5.1** `/stage` layout: iframes, captions, safety comparison, the alert area, the event log, fits both resolutions.
- **P5.2** `shared/steps.js`, the steps sidebar, keyboard shortcuts, `R` reset, `A` auto-play, `F` clean mode, the help overlay.

### P6 Verification

- **P6.1** The full e2e autopilot with assertions and screenshots at both resolutions. Review every screenshot and fix what looks wrong.
- **P6.2** The backup demo video.
- **P6.3** `npm run bench` and the `docs/results` files.
- **P6.4** `/selftest`.
- **P6.5** The 10-minute soak test, plus the no-external-URL test.

### P7 Documents and packaging

- **P7.1** `DEMO_GUIDE.md` and `DEMO_CHEATSHEET.md`.
- **P7.2** `EXPLAINED.md`.
- **P7.3** `VIVA_QA.md`.
- **P7.4** `ARCHITECTURE.md`.
- **P7.5** `REPORT_DRAFT.md`.
- **P7.6** The final README, and the start scripts for Windows, macOS and Linux.
- **P7.7** **Final acceptance run**, from a clean clone in a temporary folder:
  1. `npm ci`
  2. `npm test`
  3. `npm run e2e`
  4. `npm run bench`
  5. Start with `--no-open` and load every page.

  Paste the outputs into `PROGRESS.md`.

### P8 Optional, only after P7.7 passes

- **P8.1** "Solo mode": a static build where Alice, Eve (active attacks running in-page through the same shared modules) and Bob all run in one browser page with an in-memory relay. It must be deployable to Vercel or GitHub Pages, so the student can share a link where anyone can try it on HTTPS. Document it in the README.

---

## 17. When you finish

- Put a **Final summary** section at the top of `PROGRESS.md`:
  - what works,
  - how to run it (3 lines),
  - test results,
  - known limitations (for example, a real webcam can only be tuned on the student's laptop),
  - what the student should do next (rehearse with `A` auto-play twice, then manually; tune the camera; print the cheat sheet).
- Commit and push.
- End your final message with the same summary.
