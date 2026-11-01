# CipherCam — Progress & Handoff
Last updated: 2026-11-01 — session 1: scaffold

## Status
Everything except P6.2 (backup video), P6.5 (soak running), P7.6 tick (README + start scripts written, start-demo.sh tested) and P7.7 (acceptance) is done.

## NEXT STEP
1. When the soak finishes (`e2e/.tmp/soak.log`, results in docs/results/SOAK.md + soak.json): tick P6.5, add the soak numbers to docs/REPORT_DRAFT.md §6.2.
2. P6.2: run `npm run video` (e2e/backup-video.js) → docs/backup-demo.webm + .mp4; check sizes < 25 MB; look at a few frames (ffmpeg -ss … -frames:v 1).
3. Tick P7.6. Then P7.7: clean clone into a temp dir (`git clone` this branch), `npm ci`, `npm test`, `npm run e2e`, `npm run bench`, `npm start` + curl every page; paste outputs into PROGRESS.md; write the Final summary.

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
- [ ] P6.2 Backup demo video
- [x] P6.3 npm run bench + docs/results (verified: `npm run bench` → docs/results/bench.csv + RESULTS.md; ECB leak 89.6 %, others 0 %; ctr-hmac/gcm reject 100 % of bit-flipped and replayed frames, others 0 %; MITM 100/100 accepted, safety MISMATCH; slowest mode 0.79 ms/frame)
- [x] P6.4 /selftest (verified: e2e/selftest.spec.js — 13/13 known-answer tests PASS in Chromium: FIPS-197 via aes-js and Web Crypto, ECB/CBC/CTR/GCM/HMAC/HKDF vs OpenSSL vectors, GCM tamper rejection, ECDH, safety number, splash byte-identical, all modes round-trip; screenshot docs/screenshots/selftest.png)
- [ ] P6.5 10-minute soak + no-external-URL test
- [x] P7.1 DEMO_GUIDE.md + DEMO_CHEATSHEET.md (verified: every step 0–8 has Press / Say / audience sees (embedded screenshot) / If it doesn't work; setup A+B, three checklists, timing, recovery playbook, pitch, camera tuning; link checker: all relative links/images exist)
- [x] P7.2 EXPLAINED.md (verified: all 14 concepts + posterize/tiling + what each attack proves; every file→function pointer exists in the code)
- [x] P7.3 VIVA_QA.md (verified: 43 Q&As incl. all 9 example questions from the spec)
- [x] P7.4 ARCHITECTURE.md (verified: components, wire format table, normal + MITM handshake and frame-flow sequence diagrams (Mermaid), state model + replay state diagram)
- [x] P7.5 REPORT_DRAFT.md (verified: all required sections; numbers copied from docs/results/RESULTS.md and e2e-fps.json; references FIPS-197, SP 800-38A/D, RFC 2104/5869, Stallings)
- [ ] P7.6 Final README + start scripts
- [ ] P7.7 Final acceptance run from clean clone
- [ ] P8.1 (optional) Solo mode static build

## How to check the current state
```
npm install
npm test
```

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

## Known issues / open questions
- None yet.

## Session log (newest first)
- 2026-11-01 Session 1: P0.1 scaffold; P1 shared core + tests (36 green). Next: P2.1 server.
