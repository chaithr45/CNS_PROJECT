# CipherCam — Progress & Handoff
Last updated: 2026-11-01 — session 1: scaffold

## Status
Phase 1 done (shared core + 36 passing tests). Phase 2 (server + Alice/Bob pages) next.

## NEXT STEP
P2.1: write `server/index.js` (CLI flags --port --no-open --allow-remote-control), `server/app.js` (createServer(opts) → {start, stop, port, state}; static serving of public/, /shared, /vendor/aes-js, /vendor/qrcode; WebSocket relay at /ws?role=…; state + control patches; localhost-only rule; port fallback 8080-8090; banner + terminal QR; open browser). `server/eve-active.js` already exists (bit-flip, replay recorder, MITM) and is tested.

## Checklist
- [x] P0.1 Spec saved, CLAUDE.md/PROGRESS.md/README/.gitignore/package.json, deps installed (verified: `npm install` → 0 vulnerabilities, `npx playwright --version` → 1.63.0)
- [x] P1.1 shared/frame.js (verified: test/frame.test.js 13 tests; rendered splash + synthetic scene + ECB block view to PNG and inspected — silhouette clearly visible)
- [x] P1.2 shared/crypto.js + shared/ecb.js (verified: test/crypto.test.js — FIPS-197 C.1, ECB/CBC/CTR/GCM/HMAC/HKDF/ECDH identical to node:crypto/OpenSSL)
- [x] P1.3 shared/protocol.js, sender.js, receiver.js (verified: all 7 modes round-trip through the wire format)
- [x] P1.4 Unit tests for P1, `npm test` green (verified: `npm test` → 36 pass, 0 fail; includes attack-property tests using server/eve-active.js)
- [ ] P2.1 server (static, relay, state, localhost rule, port fallback, banner+QR, open browser)
- [ ] P2.2 /alice
- [ ] P2.3 /bob
- [ ] P2.4 Playwright smoke: Bob shows frames in every mode + screenshots
- [ ] P3.1 /eve passive views, leak meter, nonce-reuse detector, keystream recovery
- [ ] P3.2 /watch + QR codes on / and /stage
- [ ] P4.1 Bit-flip stamps
- [ ] P4.2 Replay record & loop
- [ ] P4.3 MITM
- [ ] P4.4 Integration tests for active attacks
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
- 2026-11-01 Stamp masks (star / HACKED / smiley) are drawn with pure maths in `shared/stamps.js` instead of canvas text — identical bytes in browser and Node, so the relay can build the mask itself and tests can check it. Eve's panel shows a preview canvas of the same mask.
- 2026-11-01 `npm test` runs `test/run-all.js`, which passes the explicit file list to `node --test` (shell globs don't work in Windows cmd and Node 20 has no built-in glob).
- 2026-11-01 Receiver rebuilds the GCM nonce from its own nonceSalt + seq instead of trusting the header IV (header IV is still sent, for Eve's nonce-reuse detector).
- 2026-11-01 Pinned `@playwright/test` to 1.63.0 (not latest 1.64.1) — it matches the Chromium build pre-installed in the cloud container; on the student's laptop Playwright is only needed for e2e, not for the demo.
- 2026-11-01 Pinned exact versions: ws 8.22.1, aes-js 3.1.2, qrcode 1.5.4.

## Known issues / open questions
- None yet.

## Session log (newest first)
- 2026-11-01 Session 1: P0.1 scaffold; P1 shared core + tests (36 green). Next: P2.1 server.
