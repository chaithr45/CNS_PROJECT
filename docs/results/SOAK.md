# Soak test

`npm run soak` — auto-play looped through all 9 steps for **10 minutes** on /stage (1366×768, headless Chromium, synthetic source), 2026-11-01 04:25 UTC.

| Check | Result |
|---|---|
| Console errors (Stage + Alice + Eve + Bob panels) | 0 |
| Fewest frames Bob accepted in any 30 s window | 220 |
| Browser JS heap, first third → last third of the run | 6.0 MB → 5.5 MB (-7.0 %) |
| Server heap, first third → last third | 43.7 MB → 44.1 MB (1.0 %) |
| **Verdict** | **PASS** |

Raw samples (every 30 s): `soak.json`.
