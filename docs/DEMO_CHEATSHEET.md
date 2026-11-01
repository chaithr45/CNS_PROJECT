# CipherCam — Cheat Sheet (print me)

**Start:** double-click `start-demo.bat` → Stage opens → **F11** → click the yellow caption bar → **R**. Everything is on the Stage — never open `/alice` or `/bob`.
**Keys:** `→`/`←` next/previous · `0`–`8` jump · `R` reset · `A` auto-play · `F` clean view · `?` help

| # | Step | Press | Say this (one line) | Look for |
|---|---|---|---|---|
| — | Opening | — | "Alice sends, Bob receives, Eve sits in the relay. AES is never broken; only *how* it's used." | ✓ MATCH |
| 0 | Plain video | `0` | "No encryption: anyone on the Wi-Fi sees you." | Eve = Bob |
| 1 | Encrypted call | `→` | "AES-CTR, fresh nonce: Eve sees noise. But is it secure?" | Eve noise, leak 0% |
| 2 | ECB leaks | `→` | "Same patch in, same ciphertext out: my outline leaks without the key." | Silhouette, leak ~90% |
| 3 | Nonce reuse | `→` | "Same keystream twice + the public Connecting screen = Eve watches the call." | ⚠ NONCE REUSED, Eve sees video |
| 4 | Bit-flip | `→` | "CTR is XOR: Eve flips bits, the same pixels flip on Bob. A star, no key." | ★ on Bob |
| 5 | CCTV loop | `→` *(wait)* | "Wave… leave… Eve loops old valid frames. Bob sees the past." | Alice empty, Bob waving |
| 6 | AES-GCM | `→` *(wait)* | "Tag + counter: tampering and replays rejected. Eve can block, never fake." | Red REJECTED alerts |
| 7 | MITM | `→` | "Eve swapped the ECDH keys: she sees all, Bob accepts, but the numbers differ." | ✗ MISMATCH, EVE HAS THE KEY |
| 8 | Verified keys | `→` | "Compare safety numbers out-of-band: they match. Five attacks, five fixes." | ✓ MATCH, Eve noise |

**Formulas:** `C₁⊕C₂ = P₁⊕P₂` · `K = C₀⊕P_splash` · `(C⊕M)⊕K = P⊕M` · accept only if tag ✓ and `seq > lastSeq`

**Rescue:** stuck → **R** · black panel → right-click → *Reload frame* · camera bad → side menu **📷 Video → Synthetic** · frozen → Ctrl+C in the black window, run `start-demo.bat` again · disaster → play `docs/backup-demo.mp4`

**Fixes to remember:** random IV (CBC/CTR) · unique nonce per frame · MAC: HMAC-SHA256 / AES-GCM · authenticated frame counter · safety numbers
