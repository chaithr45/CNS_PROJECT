# CipherCam — Progress & Handoff
Last updated: 2026-11-01 — session 1: scaffold

## Status
P0–P4 done (45 unit/integration tests + 3 Playwright tests green). Stage + autopilot (P5) next.

## NEXT STEP
P5.1 Stage: create `public/stage.html` + `public/js/stage.js` (+ stage styles in app.css or a <style> block). Layout: header (title, mode badge, connection), 3 iframes side by side (/alice?embed=1, /eve?embed=1, /bob?embed=1, allow="camera"), info strip (safety numbers Alice/Bob + big ✓ MATCH / ✗ MISMATCH from BroadcastChannel 'ciphercam-oob', Bob alert area read from bob iframe window.__ciphercam, event log last 8 lines from server `event` messages), Demo steps sidebar from shared/steps.js, caption bar (caption + formula), overlay for step countdowns (state.overlay), QR for /watch. Must fit 1366×768 and 1920×1080 with no scrolling. Then P5.2: keyboard (→ ← 0-8 R A F ?), autoplay running steps' `actions`, window.__ciphercam aggregate hook.

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
- [ ] P5.1 /stage layout
- [ ] P5.2 steps.js, sidebar, shortcuts, R/A/F, help overlay
- [ ] P6.1 Full e2e autopilot + screenshots at both resolutions, reviewed
- [ ] P6.2 Backup demo video
- [ ] P6.3 npm run bench + docs/results
- [ ] P6.4 /selftest
- [ ] P6.5 10-minute soak + no-external-URL test
- [ ] P7.1 DEMO_GUIDE.md + DEMO_CHEATSHEET.md
- [ ] P7.2 EXPLAINED.md
- [ ] P7.3 VIVA_QA.md
- [ ] P7.4 ARCHITECTURE.md
- [ ] P7.5 REPORT_DRAFT.md
- [ ] P7.6 Final README + start scripts
- [ ] P7.7 Final acceptance run from clean clone
- [ ] P8.1 (optional) Solo mode static build

## How to check the current state
```
npm install
npm test
```

## Decision log
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
