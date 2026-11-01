# How to test CipherCam — a click-by-click guide for beginners

This guide assumes you have **never used Node.js or a terminal before**. Follow it from top to bottom.
It takes about **20 minutes** the first time. Every step says exactly **what to click** and **what you should see**.
If what you see is different, look at the **"If not"** line under that step, or at [Troubleshooting](#troubleshooting) at the end.

You need: a **Windows laptop** (a Mac works too, see the notes marked 🍎), **internet for the first install only**, and **Chrome or Edge**.

---

## Part A — Install Node.js (only once)

Node.js is the program that runs the CipherCam "network" (the relay server).

1. Open Chrome or Edge and go to **nodejs.org**.
2. Click the big green button that says **LTS** (for example "22.x.x LTS"). A file like `node-v22.x.x-x64.msi` downloads.
3. Open the downloaded file (click it at the bottom/top of the browser, or find it in your **Downloads** folder and double-click it).
4. In the installer, click **Next** → tick **I accept** → **Next** → **Next** → **Next** → **Install**. If Windows asks "Do you want to allow this app to make changes?", click **Yes**. Then click **Finish**.
   - If a second black window appears asking to install "tools for native modules", you can just close it. CipherCam doesn't need them.
5. **Check it worked:** press the **Windows key**, type `cmd`, press **Enter**. A black "Command Prompt" window opens. Type `node -v` and press **Enter**.
   - ✅ You should see something like `v22.11.0`.
   - **If not** ("'node' is not recognized"): restart the laptop and try again.

🍎 On a Mac: same website, download the macOS installer (`.pkg`), double-click, click Continue → Agree → Install.

---

## Part B — Download CipherCam

1. Go to the project on GitHub: **github.com/chaithr45/CNS_PROJECT**.
2. Above the file list there is a **branch** button (it shows a branch name such as `main`). Click it and choose **`claude/kind-heisenberg-u8tdul`** if it exists. (Once this branch is merged into `main`, you can stay on `main`.)
   - ✅ You should see files like `start-demo.bat`, `README.md`, and folders `docs`, `public`, `server`, `shared`.
3. Click the green **`< > Code`** button → **Download ZIP**.
4. Open your **Downloads** folder, **right-click** the ZIP → **Extract All…** → **Extract**.
5. Move the extracted folder somewhere easy, e.g. your **Desktop**. Open it. You should see `start-demo.bat` inside.
   - **If not:** you may have a folder inside a folder. Open the inner folder.

(If you know git: `git clone -b claude/kind-heisenberg-u8tdul https://github.com/chaithr45/CNS_PROJECT.git`)

---

## Part C — Start CipherCam

1. In the CipherCam folder, **double-click `start-demo.bat`**.
   - If Windows shows a blue box **"Windows protected your PC"**: click **More info** → **Run anyway**. (This happens because the file was downloaded from the internet.)
2. A **black window** opens. **The first time only**, it installs CipherCam (about 1 minute, lots of text scrolls by). That needs internet.
3. Then it shows a box like this:

   ```
     ==============================================================
      CipherCam is running
     ==============================================================
      Stage (projector):   http://localhost:8080/stage
      ...
      Press Ctrl+C to stop
   ```

   - ✅ This black window **is the network**. **Keep it open** the whole time. Minimise it if you like, but don't close it.
4. Windows may ask **"Do you want to allow public and private networks to access this app?"** (Windows Defender Firewall). Tick **Private networks** and click **Allow**. (This only matters for the optional phone test.)
5. Your browser opens by itself at **`http://localhost:8080/stage`**.
   - **If no browser opens:** open Chrome or Edge yourself and type `localhost:8080/stage` in the address bar, then press **Enter**.
   - **If the black window says the port was busy**, it prints a different number (like `8081`). Use that number instead of 8080 everywhere in this guide.

🍎 On a Mac: double-click `start-demo.command`. If macOS says it "cannot be opened", **right-click** it → **Open** → **Open**.

---

## Part D — First look at the Stage (2 minutes)

The Stage is the page you will show on the projector. Look at it and check each item:

| Where on the screen | What you should see | ✅ |
|---|---|---|
| Top-left | **🔐 CipherCam**, a yellow badge **⚠ AES-CTR (random nonce)**, **Step 1 of 8**, and a green dot **● connected** | ☐ |
| Left panel (blue border) **ALICE** | A grey room with a window and a dark person (head and shoulders) gently swaying | ☐ |
| Middle panel (red border) **EVE** | Black-and-white **noise** (like TV static) | ☐ |
| Right panel (green border) **BOB** | The **same person** as Alice's panel, moving | ☐ |
| Bottom-left box **🔑 Safety numbers** | Two identical 12-digit numbers and a green **✓ MATCH** | ☐ |
| Middle box **📺 Bob's checks** | Green **✓ Accepted — this mode has no checks** and **✓ accepted** counting up | ☐ |
| Right box **📜 Event log** | Lines like "Alice sent her ECDH public key" | ☐ |
| Bottom bar (yellow border) | **Step 1 · Encrypted call** and the caption "Encrypted with AES-CTR: Eve sees pure noise. But is it secure?" | ☐ |
| Right side **Demo steps** | A list 0–8 with **1 Encrypted call** highlighted in yellow, and buttons ◀ Prev, Next ▶, ⟳ Reset, ▶ Auto, ⛶ Clean | ☐ |

**If not:**
- Bob's panel is black for more than 3 seconds → click **⟳ Reset** in the right menu.
- "connected" is red / says "reconnecting" → the black window was closed. Start `start-demo.bat` again.
- A red bar at the top says "Open this page via http://localhost…" → you opened the page with an IP address. Use `localhost:8080/stage` instead.

> **Important:** the keyboard keys only work after you **click once on the dark background** of the Stage (for example on the yellow caption bar at the bottom). Do that now.

---

## Part E — Click through every demo step (10 minutes)

Use the **→ (right arrow)** key to go to the next step, or click the step name in the **Demo steps** list on the right. After each step changes, **wait 2–3 seconds**: every step starts a new call, and the first second shows a "CIPHERCAM / CONNECTING" test card. That is normal.

### Step 0 — Plain video
- **Click:** press the **0** key (or click **0 Plain video (optional)**).
- ✅ **It works if:** Eve's middle panel shows **the same picture as Bob** (no encryption). The badge at the top says **🚫 No encryption**. The leak meter under Eve is high and red.

### Step 1 — Encrypted call
- **Click:** press **→**.
- ✅ **It works if:** Eve shows **noise**, Bob shows the person, **Leak meter 0%**, Safety numbers **✓ MATCH**.

### Step 2 — ECB leaks the shape
- **Click:** press **→**.
- ✅ **It works if:** Eve's panel turns into **big coloured blocks**, and you can clearly see the **outline of the person and the window**. The **Leak meter** under Eve says about **90%** with a red bar, and the leak box has a yellow outline. Bob still shows the normal video.

### Step 3 — Nonce reuse
- **Click:** press **→**.
- ✅ **It works if:** Eve's panel shows **the real video** again (grey room and person), with a green badge **🔓 Keystream recovered** and a flashing yellow bar **⚠ NONCE REUSED (same IV as frame #0)** at the top of Eve's panel.

### Step 4 — Bit-flipping
- **Click:** press **→**.
- ✅ **It works if:** Eve shows noise, but **Bob's video has a big star** stamped on it (parts of the picture inverted). Bob's box still says **✓ Accepted — this mode has no checks**. The event log shows **"Eve bit-flips: ★ Star"** in red.

### Step 5 — CCTV loop (this one runs by itself, about 10 seconds)
- **Click:** press **→** and then **just watch**:
  1. A big box **"● REC 5 — wave now!"** counts down 5…1, and the person waves.
  2. **"The person leaves the room…"**: in **Alice's** panel the person walks out to the right. The room is empty.
  3. **"⟲ Eve loops the old frames — Bob still sees the person"**.
- ✅ **It works if:** at the end, **Alice's panel shows an empty room** but **Bob's panel still shows the person waving**, over and over. Bob still says "Accepted".

### Step 6 — Secure mode (AES-GCM) (runs by itself, about 15 seconds)
- **Click:** press **→** and watch.
- ✅ **It works if:** the top badge turns green **🔒 AES-GCM (secure)**. After about 3 seconds a box says **"Eve tries the bit-flip…"** and Bob's panel shows a red bar **⛔ TAMPERED FRAME REJECTED (tag mismatch)**: Bob's video **freezes**, **no star appears**. Later **"Eve tries the replay…"** and the red bar says **⛔ REPLAY REJECTED (seq … ≤ last …)**. In **📺 Bob's checks**, **🛡 tampered** and **⟲ replayed** become red numbers greater than 0. Then the video moves again.
- **Extra test:** in the right menu, click the red **Try bit-flip** button → red "TAMPERED" alerts for ~3 s. Wait 4 seconds, then click **Try replay** → after ~3 s, red "REPLAY REJECTED" alerts.

### Step 7 — MITM finale
- **Click:** press **→**.
- ✅ **It works if:** the top badge says **🔀 MITM ACTIVE**. Eve's panel shows **the real video** with a red banner **🔓 EVE HAS THE KEY**. Bob still accepts frames (green). In **🔑 Safety numbers**, Alice's and Bob's numbers are **different** and there is a big red **✗ MISMATCH**.

### Step 8 — Verified keys
- **Click:** press **→**.
- ✅ **It works if:** the numbers are **the same** again with a green **✓ MATCH**, Eve shows **noise**, Bob shows the video.

### The other keys
| Press | ✅ What should happen |
|---|---|
| **←** (left arrow) | Goes back one step |
| **5** (any digit 0–8) | Jumps to that step |
| **R** | Back to **Step 1**, everything reset, ✓ MATCH |
| **F** | The right menu and the top bar disappear (clean projector view). Press **F** again to bring them back |
| **?** | A box with all the keys. Press **Esc** to close it |
| **A** | **Auto-play**: a yellow **▶ AUTO-PLAY** badge appears and the whole demo plays by itself, step 0 to 8 (about 2 minutes). Press **A** again to stop |

> **Fastest full test:** press **R**, then **A**, and watch the whole demo play by itself. Every step above should happen on its own.

---

## Part F — Test with your webcam (5 minutes)

1. On the Stage, in the right menu, find **📷 Video** and choose **Webcam**.
2. The browser asks **"localhost:8080 wants to use your camera"** → click **Allow**.
   - ✅ Within 2 seconds, Alice's panel shows **you** (in 4 shades of grey), and the small badge in Alice's panel says **📷 webcam**.
   - **If not:** a message "Camera not available — switched to the synthetic scene" appears. Close other apps using the camera (Zoom, Teams, the Windows Camera app) and choose **Webcam** again.
3. Sit about 1 metre from the laptop, with a plain wall behind you. Press **2** (ECB step).
   - ✅ In Eve's panel you should be able to **recognise your head and shoulders** made of coloured blocks, and the leak meter should be above about 60%.
   - **If the picture looks like confetti:** set **Grey levels** (right menu) to **3**. If you disappear into the wall, set it to **5**. A dark shirt and light on your face help a lot.
4. Press **→** through steps 3–8 again. Everything should work the same with your face.
5. To go back to the cartoon person: **📷 Video → Synthetic scene**.

---

## Part G — Test each page on its own (optional, 5 minutes)

The Stage shows three pages side by side. You can also open each page in its own tab. Type these addresses in a **new tab**:

| Address | What to try | ✅ What you should see |
|---|---|---|
| `localhost:8080/` | Just look | The start page with an **▶ Open Stage** button, links to every page and a QR code |
| `localhost:8080/eve` | Click the buttons **Raw ciphertext**, **Block colours**, **XOR with previous frame**, **Keystream recovery** | Eve's big picture changes. (In normal CTR mode, Keystream recovery says **"No reuse detected — attack fails"**: that's correct!) The explanation text under the buttons changes too |
| `localhost:8080/eve` | Click **HACKED**, then **Bit-flip: OFF** (it changes to **Bit-flip: ON ✏**) | The Stage's Bob panel shows the word **HACKED** stamped on the video. Click **Bit-flip: ON** again to switch it off |
| `localhost:8080/eve` | Set **Seconds** to 3, click **● Record**, wait 4 s, click **⟲ Loop**, then **■ Stop** | The status line says "Recording…", then "Recorded … press Loop", then "LOOPING old frames to Bob". Stop returns to live video |
| `localhost:8080/eve` | Click **MITM: OFF** (turns ON), later click it again | The Stage shows **✗ MISMATCH** and "EVE HAS THE KEY"; turning it off gives **✓ MATCH** again |
| `localhost:8080/selftest` | Just wait 1 second | A green **✓ All 13 tests passed** and 13 green **PASS** rows |

**Alice and Bob pages:** only **one** Alice and **one** Bob can be connected at a time (like a real call). If you open `localhost:8080/alice` or `localhost:8080/bob` in a new tab, it **takes over** from the Stage's panel, and the Stage panel shows **"⚠ Another Alice page took over. Click here to use this one again."** That is expected.
- On the `/alice` page try: the **Encryption mode** list (Bob follows the new mode), the **Grey levels** slider, **Person leaves the room**, and **⟳ Restart session (new keys)** (the safety number changes).
- On the `/bob` page try: the counters, and **⬇ Download stats CSV** (a `.csv` file downloads; open it in Excel).
- When you're done, **close those tabs** and **click the message** in the Stage panel (or press **F5** on the Stage) to bring the Stage back to normal.

---

## Part H — Test with a phone (optional)

1. Turn on **Windows Mobile Hotspot** (Settings → Network & internet → Mobile hotspot → On) and connect your phone to it. (Or put the laptop and phone on the same phone hotspot.)
2. Scan the **QR code** at the bottom of the Stage's right menu with the phone camera, or type the address shown under it (like `192.168.137.1:8080/watch`) into the phone's browser.
   - ✅ The phone shows **"😈 What the attacker sees"**, the current step's caption and Eve's picture, updating a few times per second.
   - **If the page doesn't load:** allow Node.js through the Windows Firewall for **Private networks** (Windows Security → Firewall & network protection → Allow an app through firewall → Node.js → tick Private). College Wi-Fi often blocks this, so a hotspot is best. The demo itself does not need phones.

---

## Part I — Automatic tests (optional, for the confident)

These run hundreds of checks by themselves. You type a command and read the last lines.

1. Open the CipherCam folder in File Explorer. Click in the **address bar** at the top (where the folder path is), type `cmd` and press **Enter**. A Command Prompt opens **inside the CipherCam folder**.
   (🍎 Mac: open Terminal, type `cd ` with a space, drag the CipherCam folder into the window, press Enter.)
2. Type `npm test` and press **Enter**. Wait ~15 seconds.
   - ✅ The last lines say **`# pass 48`** and **`# fail 0`**.
3. (Optional, needs internet once) Type `npx playwright install chromium` and press **Enter** (downloads a test browser, ~150 MB). Then type `npm run e2e` and press **Enter**. Wait ~5 minutes. Don't touch anything while it runs.
   - ✅ The last line says something like **`10 passed`** (no "failed"). It also refreshes the pictures in `docs/screenshots`.
   - Note: `npm run e2e` starts its own server on port 8199, so it's fine if the demo is running too, but close heavy apps first.
4. Type `npm run bench` and press **Enter**.
   - ✅ A table per mode, ending with `Wrote docs/results/bench.csv and docs/results/RESULTS.md`. ECB shows a leak of about 90%; `ctr-hmac` and `gcm` show `bit-flip rejected 100 %  replay rejected 100 %`.

---

## Part J — Stop CipherCam

Click the **black window** and press **Ctrl + C** (it says "Stopping CipherCam…"), or just close the black window. The browser pages will then show "reconnecting…". That's normal.

To start again later: double-click `start-demo.bat` (it won't reinstall; it starts in a few seconds).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Node.js was not found" in the black window | Do Part A, then restart the laptop |
| "Windows protected your PC" | Click **More info** → **Run anyway** |
| The black window closes immediately | Open Command Prompt in the folder (Part I step 1), type `start-demo.bat` and read the error message |
| "npm install failed" | You need internet for the first start. Connect and try again |
| Browser didn't open | Type `localhost:8080/stage` yourself |
| Keys do nothing | Click once on the dark background or the yellow caption bar of the Stage first |
| A panel is black or frozen | Press **R**. Still stuck: right-click inside the panel → **Reload frame**. Still stuck: press **F5** |
| A panel says "Another … page took over" | You opened `/alice` or `/bob` in another tab. Close that tab and click the message (or press F5) |
| Red bar: "Open this page via http://localhost…" | You used an IP address or `file://`. Use `localhost:8080/stage` |
| Webcam not working | Close Zoom/Teams/Camera app, choose **📷 Video → Webcam** again, allow the camera. Or use **Synthetic scene**: every step works with it |
| Everything is frozen | In the black window press **Ctrl + C**, double-click `start-demo.bat` again, then press **F5** in the browser |

---

## My test checklist

- [ ] Part A: `node -v` shows a version
- [ ] Part C: the black window says "CipherCam is running" and the Stage opens
- [ ] Part D: Alice + Bob show video, Eve shows noise, ✓ MATCH
- [ ] Step 2: the outline is visible in Eve's coloured blocks, leak ~90%
- [ ] Step 3: Eve sees the real video, "NONCE REUSED"
- [ ] Step 4: a star on Bob's video
- [ ] Step 5: Alice's room empty, Bob still sees the person
- [ ] Step 6: red TAMPERED and REPLAY alerts, no star on Bob
- [ ] Step 7: ✗ MISMATCH and "EVE HAS THE KEY"
- [ ] Step 8: ✓ MATCH again
- [ ] Keys R, F, ?, A all work
- [ ] Webcam: my outline shows in step 2
- [ ] `/selftest`: All 13 tests passed
- [ ] (optional) `npm test`: `# fail 0`
