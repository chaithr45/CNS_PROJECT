# CipherCam — Progress & Handoff
Last updated: 2026-11-01 — session 1: scaffold

## Status
Phase 1 in progress — shared/frame.js, ecb.js, crypto.js, protocol.js, sender.js, receiver.js written and smoke-checked by hand (all 7 modes round-trip, ECB leak 88 %). Formal unit tests (P1.4) not written yet.

## NEXT STEP
1. Visually check the synthetic scene + splash (render to PNG) and tick P1.1–P1.3.
2. P1.4: write `test/frame.test.js`, `test/crypto.test.js`, `test/attacks.test.js`, `test/make-vectors.js` → `test/vectors.json`. Run `npm test` until green.

## Checklist
- [x] P0.1 Spec saved, CLAUDE.md/PROGRESS.md/README/.gitignore/package.json, deps installed (verified: `npm install` → 0 vulnerabilities, `npx playwright --version` → 1.63.0)
- [ ] P1.1 shared/frame.js
- [ ] P1.2 shared/crypto.js + shared/ecb.js
- [ ] P1.3 shared/protocol.js, sender.js, receiver.js
- [ ] P1.4 Unit tests for P1, `npm test` green
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
- 2026-11-01 Pinned `@playwright/test` to 1.63.0 (not latest 1.64.1) — it matches the Chromium build pre-installed in the cloud container; on the student's laptop Playwright is only needed for e2e, not for the demo.
- 2026-11-01 Pinned exact versions: ws 8.22.1, aes-js 3.1.2, qrcode 1.5.4.

## Known issues / open questions
- None yet.

## Session log (newest first)
- 2026-11-01 Session 1: P0.1 scaffold; shared core files written (P1.1–P1.3 code, unverified by tests). Next: P1.4 tests.
