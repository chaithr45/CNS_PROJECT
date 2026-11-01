// e2e/backup-video.js — record the auto-played demo as a video (npm run video).
// Plan B for the presenter: if the live demo fails, play docs/backup-demo.mp4 (or .webm).
// Starts the server in-process, opens /stage at 1366×768, presses R, then auto-plays
// steps 0–8 once while Playwright records the screen.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createCipherServer } from '../server/app.js';
import { STEPS } from '../shared/steps.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'e2e', '.tmp', 'video');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const app = await createCipherServer({ port: 8197, portTries: 5, quiet: true });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
const size = { width: 1366, height: 768 };
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: TMP, size } });
const page = await ctx.newPage();
await page.goto(`http://localhost:${app.port}/stage`);
await page.waitForFunction(() => (window.__ciphercam?.bob?.counts.accepted || 0) > 5, null, { timeout: 30_000 });
await page.evaluate(() => window.__ciphercam.reset());
await page.waitForTimeout(2500);
const total = STEPS.reduce((a, s) => a + s.duration, 0);
console.log(`Recording the auto-play demo (${(total / 1000).toFixed(0)} s)…`);
await page.evaluate(() => window.__ciphercam.startAuto(0));
await page.waitForTimeout(total + 1500);
await page.evaluate(() => window.__ciphercam.reset());
await page.waitForTimeout(500);
const video = page.video();
await ctx.close();
const src = await video.path();
await browser.close();
await app.close();

const webm = path.join(ROOT, 'docs', 'backup-demo.webm');
fs.copyFileSync(src, webm);
console.log(`Saved ${path.relative(ROOT, webm)} (${(fs.statSync(webm).size / 1e6).toFixed(1)} MB)`);

// Convert to MP4 (plays everywhere, including PowerPoint) if ffmpeg is installed.
const mp4 = path.join(ROOT, 'docs', 'backup-demo.mp4');
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
if (ff.status === 0) console.log(`Saved ${path.relative(ROOT, mp4)} (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
else console.log('ffmpeg not available: only the .webm was written (Chrome, Edge and VLC play it).');
