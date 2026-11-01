# CLAUDE.md — CipherCam

CipherCam is a live, encrypted, in-browser video call built for the EC 425 Cryptography
and Network Security course (NIT Warangal). **Alice** sends 160×120 grayscale webcam
frames, **Bob** receives them, and **Eve** is an attacker sitting in the Node.js WebSocket
relay (like a hacked Wi-Fi router). The demo shows five classic mistakes in *how* AES is
used — ECB pattern leak, CTR nonce reuse, bit-flipping, replay ("CCTV loop") and a
key-exchange man-in-the-middle — and the fix for each (randomized modes, unique nonces,
HMAC / AES-GCM, an authenticated frame counter, and safety-number checks). The presenter
drives everything from the `/stage` page on a Windows laptop with a projector.

**ALWAYS read PROGRESS.md and docs/SPEC.md first and continue from NEXT STEP.**

## Working rules (short)
1. Start of every session: read `CLAUDE.md`, `PROGRESS.md`, `docs/SPEC.md`; run
   `git log --oneline -15` and `npm test`; continue from **NEXT STEP**.
2. After every task (P-ids in SPEC §16): verify it (tests / screenshot / output), tick it in
   `PROGRESS.md` with the evidence, update NEXT STEP, commit `P<id>: <what>`, push.
   Never tick anything unverified.
3. Running low on context/time: stop new work, write a precise handoff in `PROGRESS.md`, commit, push.
4. If the spec is wrong/impossible: fix it sensibly and record it in the Decision log. Never silently drop features.
5. Push only to the session branch, never force-push. Keep `package-lock.json` committed; pin exact versions.

## Commands
| Command | What it does |
|---|---|
| `npm test` | Unit + integration tests (node:test, no browser) |
| `npm run e2e` | Playwright/Chromium end-to-end autopilot, screenshots, backup video |
| `npm run demo` | Start the server and open the Stage in the default browser |
| `npm start` | Start the server without opening a browser (`--no-open`) |
| `npm run bench` | Per-mode benchmark → `docs/results/` |
| `npm run vectors` | Regenerate `test/vectors.json` with node:crypto |
| `npm run soak` | 10-minute auto-play soak test |
| `npm run video` | Re-record the backup demo video (docs/backup-demo.webm/.mp4) |
| `npm run build:solo` | Build the static solo-mode site into dist-solo/ |

## Folder map
```
server/        Node relay: static files, WebSocket relay, state, Eve's active attacks
shared/        Code used by BOTH browser and Node (frames, crypto, protocol, sender, receiver, steps)
public/        HTML pages, CSS and browser JS (alice, bob, eve, watch, stage, selftest, landing)
test/          node:test unit + integration tests, test vectors
e2e/           Playwright tests (autopilot, screenshots, soak)
bench/         Benchmark script
solo/          Optional static "solo mode" build (P8)
docs/          SPEC, demo guide, explanations, viva Q&A, architecture, report, screenshots, results
```

## Constraints
- Vanilla JS ES modules, **no build step**, no TypeScript, no framework.
- **No CDN, no Google Fonts, no external URLs at runtime** — everything is served from `node_modules` via `/vendor`.
- **Windows-first**: no bash-only npm scripts, use `path.join`, `start-demo.bat`.
- **Offline** after `npm install`.
- `shared/` must not touch Node-only or browser-only globals at import time.
