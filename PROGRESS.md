# CipherCam — Progress & Handoff
Last updated: 2026-11-01 — session 3 (handover): final acceptance PASSED from a clean clone

## Final summary

**What works (all verified, evidence below):** the live encrypted call (Alice → Node relay with Eve → Bob, 160×120 at 10 fps), all **5 attacks** (ECB pattern leak, CTR nonce reuse + keystream recovery, CTR bit-flipping, replay "CCTV loop", ECDH man-in-the-middle) and all **5 fixes** (randomized modes, unique nonces, HMAC-SHA256 / AES-GCM, authenticated frame counter, safety numbers); all 7 modes; the Stage with 9 scripted steps, captions, keyboard shortcuts, auto-play, clean view and the mode / video / grey-level controls; Eve's panel; `/watch` for phones; `/selftest`; optional solo mode (also as a static site); backup video; beginner-to-viva documentation.

**How to run (Windows):**
1. Install Node.js LTS from nodejs.org.
2. Download `https://github.com/chaithr45/CNS_PROJECT/archive/refs/heads/claude/keen-gates-2y13h1.zip`, right-click → Extract All.
3. Double-click `start-demo.bat` → the Stage opens → click the caption bar → `R`, then `→` through the steps (or `A` for auto-play).

**Test results (clean clone of commit fee635e, this session):** `npm ci` 0 vulnerabilities · `npm test` **54/54 pass** · `npm run e2e` **10/10 pass** · `npm run bench` OK (ECB leak 89.6 %, others 0 %; GCM and CTR+HMAC reject 100 % of bit-flipped and replayed frames; MITM 100/100 accepted, safety numbers MISMATCH) · all 8 pages HTTP 200 · **offline** run in a network namespace without internet: whole demo works, 0 external requests, 0 errors · `start-demo.sh` repairs a broken install.

**Known limitations:** tested in a Linux cloud container with headless Chromium and a fake/synthetic camera only — `start-demo.bat` on real Windows, a real webcam and the projector must be checked on the student's laptop; tested on Node.js 22 only (`engines: >=20`); the backup video was recorded before session 3's cosmetic UI changes (still accurate); 12-digit safety numbers (~40 bits) are fine against the demo's Eve but a key-searching attacker could find a colliding pair (documented in VIVA_QA Q36 and the report).

**What the student should do next:** follow `docs/HOW_TO_TEST.md` once on the laptop (30 min); rehearse with `A` auto-play twice, then twice by hand with `docs/DEMO_GUIDE.md`, saying the "Say" lines aloud; tune the webcam (side menu → 📷 Video → Webcam, Grey levels); print `docs/DEMO_CHEATSHEET.md`; learn the bold answers in `docs/VIVA_QA.md`; copy `docs/backup-demo.mp4` to the desktop.

## Status
All tasks P0.1–P8.1 are done and verified. Final acceptance (P7.7) passed from a clean clone after the last code change.

## NEXT STEP
Nothing mandatory is left. Optional, on the student's Windows laptop: run `docs/HOW_TO_TEST.md` §13 checklist (real `start-demo.bat`, real webcam, projector). If anything in the UI changes later, re-run `npm test`, `npm run e2e` and (optionally) `npm run video` to re-record the backup video.

## Checklist
- [x] P0.1 Spec saved, CLAUDE.md/PROGRESS.md/README/.gitignore/package.json, deps installed (verified: `npm install` → 0 vulnerabilities, `npx playwright --version` → 1.63.0)
- [x] P1.1 shared/frame.js (verified: test/frame.test.js 13 tests; rendered splash + synthetic scene + ECB block view to PNG and inspected — silhouette clearly visible)
- [x] P1.2 shared/crypto.js + shared/ecb.js (verified: test/crypto.test.js — FIPS-197 C.1, ECB/CBC/CTR/GCM/HMAC/HKDF/ECDH identical to node:crypto/OpenSSL)
- [x] P1.3 shared/protocol.js, sender.js, receiver.js (verified: all 7 modes round-trip through the wire format)
- [x] P1.4 Unit tests for P1, `npm test` green (verified: `npm test` → 36 pass, 0 fail; includes attack-property tests using server/eve-active.js)
- [x] P2.1 server (static, relay, state, localhost rule, port fallback, banner+QR, open browser) (verified: test/server.test.js 9 integration tests; `node server/index.js --no-open` printed banner with Stage URL, LAN /watch URL and terminal QR)
- [x] P2.2 /alice (verified: Playwright quick check — Alice sends at 10 fps / 189 KB/s, safety number shown, no console errors)
- [x] P2.3 /bob (verified: Bob accepted 34 frames at 10 fps, latency 2 ms, same safety number as Alice; counters + CSV button present)
- [x] P2.4 Playwright smoke: Bob shows frames in every mode + screenshots (verified: `npx playwright test e2e/smoke.spec.js` → 2 passed; docs/screenshots/smoke-bob-<mode>.png for all 7 modes, no console errors)
- [x] P3.1 /eve passive views, leak meter, nonce-reuse detector, keystream recovery (verified: Playwright run over all views — ECB block view leak 92 % with clear silhouette, ctr 0 %; ctr-reuse keystream 'recovered' + nonceReuse {seq, firstSeq 0}; ctr shows 'No reuse detected — attack fails'; MITM shows 'EVE HAS THE KEY'; screenshots inspected)
- [x] P3.2 /watch + QR codes on / and /stage (verified: e2e loads http://<LAN-IP>:8199/watch, isSecureContext=false, >3 frames rendered, phone cannot connect as stage (4003); landing page QR inspected. Stage QR is added in P5.1.)
- [x] P4.1 Bit-flip stamps (verified: e2e/eve-panel.spec.js clicks HACKED + Bit-flip → CTR Bob shows the stamp (attack-bitflip-ctr-bob.png), GCM Bob rejects 'TAMPERED FRAME REJECTED' (attack-bitflip-gcm-bob.png); test/attacks + server tests check original⊕mask byte-exactly)
- [x] P4.2 Replay record & loop (verified: e2e clicks Record 2 s → ready → Loop → GCM Bob 'REPLAY REJECTED (seq 18 ≤ last 39)' → Stop → live video resumes; server test: CTR accepts looped old frames)
- [x] P4.3 MITM (verified: e2e MITM toggle → mitmActive, Eve view 'EVE HAS THE KEY', Bob still accepts GCM frames, safety numbers differ; toggle off → numbers match)
- [x] P4.4 Integration tests for active attacks (verified: test/server.test.js — bit-flip, replay, MITM, watcher throttling + keystream over network, non-localhost control refused, Alice replacement, every step patch; `npm test` 45 pass)
- [x] P5.1 /stage layout (verified: Playwright screenshots at 1366×768 and 1920×1080 — scrollWidth/Height equal viewport (no scrolling); steps 2, 3, 4, 7 inspected: ECB silhouette, keystream recovery, star on Bob, MITM + ✗ MISMATCH)
- [x] P5.2 steps.js, sidebar, shortcuts, R/A/F, help overlay (verified: e2e/autopilot.spec.js presses R, 0–8, →, ←, F, ?, Escape, A (start/stop) and asserts the result; clean-<w>.png and help-<w>.png screenshots)
- [x] P6.1 Full e2e autopilot + screenshots at both resolutions, reviewed (verified: e2e/autopilot.spec.js 5/5 passed — every step's `expect` asserted at 1366×768 and 1920×1080, no scrolling, no console errors; Bob 10.0 fps average with 3 panels (docs/results/e2e-fps.json); fake-camera pass; all 18 step screenshots reviewed — fixed splash-frame screenshots, overlay covering Alice, Bob keeping a stale stamped frame, unreadable overlay badges)
- [x] P6.2 Backup demo video (verified: `npm run video` → docs/backup-demo.webm 17.6 MB + docs/backup-demo.mp4 15.8 MB (ffmpeg), 107 s, both < 25 MB; frames at 25/50/75/92 s inspected: ECB, CCTV loop, GCM rejections, MITM mismatch with captions)
- [x] P6.3 npm run bench + docs/results (verified: `npm run bench` → docs/results/bench.csv + RESULTS.md; ECB leak 89.6 %, others 0 %; ctr-hmac/gcm reject 100 % of bit-flipped and replayed frames, others 0 %; MITM 100/100 accepted, safety MISMATCH; slowest mode 0.79 ms/frame)
- [x] P6.4 /selftest (verified: e2e/selftest.spec.js — 13/13 known-answer tests PASS in Chromium: FIPS-197 via aes-js and Web Crypto, ECB/CBC/CTR/GCM/HMAC/HKDF vs OpenSSL vectors, GCM tamper rejection, ECDH, safety number, splash byte-identical, all modes round-trip; screenshot docs/screenshots/selftest.png)
- [x] P6.5 10-minute soak + no-external-URL test (verified: `npm run soak` → PASS: 0 console errors in 10 min of looping auto-play, min 220 Bob frames / 30 s, browser heap 6.0→5.5 MB, server heap 43.7→44.1 MB (docs/results/SOAK.md); test/no-external-urls.test.js 3/3 pass)
- [x] P7.1 DEMO_GUIDE.md + DEMO_CHEATSHEET.md (verified: every step 0–8 has Press / Say / audience sees (embedded screenshot) / If it doesn't work; setup A+B, three checklists, timing, recovery playbook, pitch, camera tuning; link checker: all relative links/images exist)
- [x] P7.2 EXPLAINED.md (verified: all 14 concepts + posterize/tiling + what each attack proves; every file→function pointer exists in the code)
- [x] P7.3 VIVA_QA.md (verified: 43 Q&As incl. all 9 example questions from the spec)
- [x] P7.4 ARCHITECTURE.md (verified: components, wire format table, normal + MITM handshake and frame-flow sequence diagrams (Mermaid), state model + replay state diagram)
- [x] P7.5 REPORT_DRAFT.md (verified: all required sections; numbers copied from docs/results/RESULTS.md and e2e-fps.json; references FIPS-197, SP 800-38A/D, RFC 2104/5869, Stallings)
- [x] P7.6 Final README + start scripts (verified: README has screenshot, Windows/macOS quick start, commands, pages, docs, folder map; start-demo.bat (CRLF, Node check, npm install if needed, npm run demo), start-demo.command/.sh executable (git mode 100755); ./start-demo.sh started the server and printed the banner; link check passes)
- [x] P7.7 Final acceptance run from clean clone (verified, session 3, after the last code change — outputs pasted in "Acceptance run" below: `git clone --branch claude/keen-gates-2y13h1` at fee635e → `npm ci` (0 vulnerabilities) → `npm test` 54/54 → `npm run e2e` 10/10 → `npm run bench` OK → `npm start` + every page HTTP 200 → offline namespace run: full demo, 0 external requests, 0 errors)
- [x] P8.1 (optional) Solo mode static build (verified: e2e/solo.spec.js — ECB leak > 50 %, keystream recovered, GCM tamper > 5 and replay > 5, MITM mismatch → match, layout check, no console errors, plus a regression check that Bob's old alert/counters vanish on a step change; `npm run build:solo` → dist-solo/ served from a sub-folder (like GitHub Pages) at http://localhost:8500/CNS_PROJECT/ → ECB leak 92 %, keystream recovered, 35 tampered + 6 replayed rejected, MISMATCH → MATCH, 0 HTTP errors, 0 console errors; documented in README "Solo mode")

## How to check the current state
```
npm ci            # → found 0 vulnerabilities
npm test          # → # tests 54, # pass 54, # fail 0   (~25 s)
npm run e2e       # → 10 passed (~3.5 min; needs `npx playwright install chromium` once on a new machine)
npm run bench     # → table per mode, ECB leak 89.6 %, gcm/ctr-hmac reject 100 %
```

## Acceptance run (session 3, clean clone, commit fee635e)
```
### git clone --branch claude/keen-gates-2y13h1
fee635e Regenerate screenshots and benchmark results; ...
### npm ci
found 0 vulnerabilities
### npm test
# tests 54
# pass 54
# fail 0
# cancelled 0
### npm run e2e
✓   1 autopilot: every step at 1366×768 (keyboard, assertions, screenshots) (57.8s)
✓   2 autopilot: every step at 1920×1080 (keyboard, assertions, screenshots) (58.0s)
✓   3 step 6 sub-actions: "Try bit-flip" and "Try replay" are both rejected (9.8s)
✓   4 performance: Bob sustains the frame rate with all three Stage panels open (13.3s)
✓   5 fake camera source: the whole pipeline works with a (fake) webcam (12.3s)
✓   6 Eve panel: bit-flip stamp, replay record/loop/stop, MITM toggle (10.4s)
✓   7 /selftest: every primitive passes its known-answer test in the browser (367ms)
✓   8 Bob receives and shows frames in every mode (Alice, Eve, Bob pages) (18.4s)
✓   9 /watch works from the LAN address (not a secure context) and renders frames (1.2s)
✓  10 solo mode: ECB leak, nonce reuse, bit-flip, GCM rejections and MITM all work in one page (14.3s)
10 passed (3.3m)
### npm run bench
plain      enc 0.055 ms  dec 0.051 ms  overhead 0 B  leak 89.6 %  bit-flip rejected 0 %  replay rejected 0 %
ecb        enc 0.825 ms  dec 0.817 ms  overhead 0 B  leak 89.6 %  bit-flip rejected 0 %  replay rejected 0 %
cbc        enc 0.168 ms  dec 0.147 ms  overhead 32 B  leak 0.0 %  bit-flip rejected 0 %  replay rejected 0 %
ctr        enc 0.166 ms  dec 0.139 ms  overhead 16 B  leak 0.0 %  bit-flip rejected 0 %  replay rejected 0 %
ctr-reuse  enc 0.141 ms  dec 0.146 ms  overhead 16 B  leak 0.0 %  bit-flip rejected 0 %  replay rejected 0 %
ctr-hmac   enc 0.295 ms  dec 0.263 ms  overhead 48 B  leak 0.0 %  bit-flip rejected 100 %  replay rejected 100 %
gcm        enc 0.143 ms  dec 0.127 ms  overhead 28 B  leak 0.0 %  bit-flip rejected 100 %  replay rejected 100 %
MITM (gcm): Bob accepted 100/100 re-encrypted frames; safety numbers 0490 5178 4734 vs 6162 2824 2169 → MISMATCH (Eve detected)
### npm start (--no-open) — banner + every page
   CipherCam is running
   Stage (projector):   http://localhost:8080/stage
   Landing page:        http://localhost:8080/
   Audience phones (same Wi-Fi / hotspot) open:
     http://192.0.2.2:8080/watch   (eth0)
/          200 CipherCam                    /stage    200 CipherCam — Stage
/alice     200 CipherCam — Alice (sender)   /bob      200 CipherCam — Bob (receiver)
/eve       200 CipherCam — Eve (attacker)   /watch    200 CipherCam — what the attacker sees
/selftest  200 CipherCam — Self-test        /solo     200 CipherCam — Solo mode
/vendor/aes-js/index.js 200 · /shared/crypto.js 200 · /docs/backup-demo.mp4 200 (15.8 MB)
### OFFLINE: server + Chromium in a network namespace with only loopback (internet unreachable)
/selftest 13 pass / 0 fail · /alice + /bob alone: Bob accepted 11, same safety number
/stage: step1 CTR leak 0 % · step2 ECB leak 92 % · step3 keystream recovered + NONCE REUSED ·
        step4 bit-flip on, Bob accepted 16 (no checks) · step5 looping, person away, Bob accepted 24 old frames in 2.5 s ·
        step6 GCM {accepted 65, tamper 35, replay 6, decrypt 0} · step7 0747 1607 5960 vs 0275 8661 1754 ✗ MISMATCH ·
        step8 ✓ MATCH · R → step 1
/solo: MITM → MISMATCH
external requests: NONE · HTTP errors: NONE · console/page errors: NONE
### start-demo.sh with node_modules/qrcode deleted (half-finished install)
First start: installing CipherCam (needs internet once)...
added 1 package, and audited 35 packages in 387ms
   CipherCam is running
qrcode reinstalled: yes · GET /stage after repair: 200
```
`start-demo.bat` cannot be executed in the Linux container: checked by review and with `git archive` (what GitHub's "Download ZIP" uses) → CRLF line endings; same install/repair logic as the tested `start-demo.sh`.

## Session 3 re-verification (beyond the acceptance run)
- Solo-mode bug reproduced (Bob's "⛔ REPLAY REJECTED" and red bar stayed 1.5 s into the next step), fixed, and covered by an e2e assertion that FAILS on the old code ("Received: ⛔ REPLAY REJECTED (seq 72 ≤ last 99)") and passes on the new.
- Stage: Bob's alert/counters were shown up to 250 ms into a new session; now only the current session's status is shown (repro: alert cleared at the first 10 ms sample).
- `test/independent.test.js` (6 tests, 5/5 stable reruns): OpenSSL-only Bob/Eve against the app's real sender and the real relay — wire bytes = OpenSSL bytes in all 7 modes; ECB equal tiles → equal blocks, leak > 50 % vs < 1 %; `C⊕K` = exact live picture in ctr-reuse, `C₁⊕C₂ = P₁⊕P₂`, < 2 % byte match with fresh nonces (random chance ≈ 0.4 %); bit-flip = P ⊕ mask in CTR, OpenSSL tag failure with untouched tag in GCM and CTR+HMAC; replay accepted in CTR, valid-tag-but-old-seq rejection in GCM/CTR+HMAC, live again after Stop; MITM accepted by OpenSSL GCM, Eve's plaintext = Alice's, safety numbers differ (recomputed independently), match without MITM. The app's receiver agreed with the OpenSSL receiver on every frame.
- Stage layout: programmatic check (no overlapping children, nothing outside its container or the window, no cut-off labels) at 1366×768 and 1920×1080 for every step and the clean view — all OK; a deliberately broken stylesheet is detected. Now part of `npm run e2e`.
- e2e now also asserts Alice, Eve and Bob share the current session id at every step, `mitmActive` matches the step, and every step has a new safety number.

## Decision log
- 2026-11-01 Replay has a 4th phase `ready` (recording finished, not yet looping) besides off/recording/looping — makes the Eve panel and the Stage log clearer; Stop after looping returns to `ready` so the same recording can be looped again.
- 2026-11-01 Stage digit keys: `0`–`8` jump to steps 0–8 (the steps are numbered from 0); `9` goes to the last step.
- 2026-11-01 Every demo step sends `restart: true`, so any step is reachable from any other with a fresh session and no leftover state. MITM toggle also restarts automatically (so "takes effect on restart" happens immediately).
- 2026-11-01 Non-localhost clients may only connect as `watch` (close 4003 otherwise) — stricter than "no control messages", so a phone can't impersonate Alice/Bob either. A test-only header `x-ciphercam-simulate-remote` can only REMOVE rights, so it is safe to honour always.
- 2026-11-01 Bob clears his screen and per-session counters at every new session (the totals are kept in the debug hook) — otherwise a stamped frame from the previous step stayed frozen on screen in GCM, which looked like GCM had failed.
- 2026-11-01 The Stage's Bob alert area and debug hook read the same-origin iframes' `window.__ciphercam`; safety numbers reach the Stage only through the out-of-band BroadcastChannel.
- 2026-11-01 Backup video and soak test are separate scripts (`npm run video`, `npm run soak`) rather than part of `npm run e2e`, so `npm run e2e` stays ~4 minutes.
- 2026-11-01 Eve's passive views and /watch get Alice's ORIGINAL frames (before Eve's own bit-flip), which is what an eavesdropper on the wire sees.
- 2026-11-01 Playwright launches Chromium with `--proxy-server=direct://` — the cloud container sets HTTPS_PROXY and Chromium otherwise sends ws:// to the LAN IP through that proxy (403). Irrelevant on the student's laptop, harmless there.
- 2026-11-01 Stamp masks (star / HACKED / smiley) are drawn with pure maths in `shared/stamps.js` instead of canvas text — identical bytes in browser and Node, so the relay can build the mask itself and tests can check it. Eve's panel shows a preview canvas of the same mask.
- 2026-11-01 `npm test` runs `test/run-all.js`, which passes the explicit file list to `node --test` (shell globs don't work in Windows cmd and Node 20 has no built-in glob).
- 2026-11-01 Receiver rebuilds the GCM nonce from its own nonceSalt + seq instead of trusting the header IV (header IV is still sent, for Eve's nonce-reuse detector).
- 2026-11-01 Pinned `@playwright/test` to 1.63.0 (not latest 1.64.1) — it matches the Chromium build pre-installed in the cloud container; on the student's laptop Playwright is only needed for e2e, not for the demo.
- 2026-11-01 Pinned exact versions: ws 8.22.1, aes-js 3.1.2, qrcode 1.5.4.
- 2026-11-01 (s3) A peer `hello` that arrives before a page's own ECDH key pair is ready is kept (`earlyHello`) and used once the key pair exists, instead of being dropped (which would hang that session). Found because an instant OpenSSL Bob triggered it in the Node harness; not reproduced in real Chromium in 50 tries (Web Crypto key generation runs off the main thread), so the fix is defensive. `test/sim-clients.js` also no longer keeps the previous session's key pair.
- 2026-11-01 (s3) The Stage shows Bob's alert and counters only when Bob is in the current session (`bob.sid === state.sid`), refreshed on every state message; otherwise "🔑 New session — exchanging keys…".
- 2026-11-01 (s3) Independent verification uses node:crypto (OpenSSL) for everything except the app parts under test; the app's receiver is run on the same bytes and must agree frame by frame.
- 2026-11-01 (s3) The Stage's video dropdown says "Synthetic" / "Webcam" (the old "Synthetic scene" was cut off at 1366 px); docs updated. `.st-side > .st-field` no longer grows vertically.
- 2026-11-01 (s3) The Stage has no Flicker-margin or fps control on purpose (sidebar space at 1366×768); defaults 6 / 10 are right, and DEMO_GUIDE explains the advanced Alice-page route. Docs never send the student to `/alice` or `/bob` for the demo.
- 2026-11-01 (s3) Start scripts install unless `ws`, `aes-js` and `qrcode` are all present (an interrupted first install is repaired).
- 2026-11-01 (s3) Backup video NOT re-recorded: session-3 UI changes are cosmetic (dropdown label, label spacing, faster alert clearing) and re-committing ~33 MB of video would bloat every clone.
- 2026-11-01 (s3) Docs: VIVA_QA Q36 corrected — 12-digit safety numbers vs an Eve who searches for colliding key pairs (~2²⁰ per side); commitments (ZRTP) / long-term identity keys (Signal) are the real fix. "GCM is the fastest mode" removed (it is about as fast as CTR; timings vary between runs).

## Known issues / open questions
- Not testable in the cloud container: `start-demo.bat` on real Windows, a real webcam, a projector, Edge. Covered by docs/HOW_TO_TEST.md §13 for the student.
- Only Node.js 22 was tested; downloading another Node binary was blocked in this environment. The code uses only long-stable APIs (`engines: >=20`).
- The backup video shows the pre-session-3 UI (cosmetic differences only).
- Flicker margin and fps can only be changed on `/alice` (opening it takes over the Stage's Alice panel; click the message to take it back).
- Safety numbers are 12 digits (~40 bits): see Decision log / VIVA_QA Q36.

## Session log (newest first)
- 2026-11-01 Session 3 (continued): docs aligned with the Stage (HOW_TO_TEST download link + reset + webcam fallback + solo; DEMO_GUIDE/CHEATSHEET/README/VIVA/REPORT/EXPLAINED/ARCHITECTURE), start scripts repair broken installs, landing page links /solo, screenshots + bench regenerated, P7.7 acceptance from a clean clone PASSED (54/54, 10/10, bench, pages, offline), P8.1 static build verified. Final summary written.
- 2026-11-01 Session 3 (took over from an out-of-credits session; last pushed commit was 265211b — later local work of that session had NOT been pushed and was redone): baseline npm test 48/48, e2e 10/10. Fixed: solo Bob alert/counters lingering into the next step (regression test fails on old code); Bob/solo ignore in-flight frames of an old session; Stage shows Bob's status only for the current session; early-hello race (Alice/Bob dropped a peer key that arrived before their own key pair was ready); sim-clients reused an old key pair. Added test/independent.test.js (OpenSSL-only Bob/Eve vs the real relay) and a Stage layout-overlap check in e2e.
- 2026-11-01 Session 1: P0.1 scaffold; P1 shared core + tests (36 green). Next: P2.1 server.
