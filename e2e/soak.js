// e2e/soak.js — reliability soak test (npm run soak).
// Starts the server in-process, opens the Stage in Chromium and lets the auto-play loop
// through the whole demo for SOAK_MINUTES (default 10). Every 30 s it records:
//   * console errors from the Stage and all three panels,
//   * the browser JS heap (performance.memory, after a forced garbage collection),
//   * the server's Node.js heap, and Bob's accepted-frame counter.
// Pass = no console errors, frames keep flowing, and no steady memory growth.
// Results: docs/results/soak.json and docs/results/SOAK.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createCipherServer } from '../server/app.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINUTES = parseFloat(process.env.SOAK_MINUTES || '10');
const app = await createCipherServer({ port: 8198, portTries: 5, quiet: true });
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--js-flags=--expose-gc', '--enable-precise-memory-info', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${app.port}/stage?loop=1`);
await page.waitForFunction(() => (window.__ciphercam?.bob?.counts.accepted || 0) > 5, null, { timeout: 30_000 });
await page.evaluate(() => window.__ciphercam.startAuto(0));
console.log(`Soak test: auto-play looping for ${MINUTES} minutes…`);

const samples = [];
const t0 = Date.now();
let lastAcc = 0;
while (Date.now() - t0 < MINUTES * 60_000) {
  await page.waitForTimeout(30_000);
  const s = await page.evaluate(() => {
    window.gc?.();
    const c = window.__ciphercam;
    return { heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, step: c.step, autoplay: c.autoplay, bobTotal: c.bob?.totals?.accepted ?? 0 };
  });
  global.gc?.();
  s.t = Math.round((Date.now() - t0) / 1000);
  s.serverHeapMB = app.heap() / 1048576;
  s.errors = errors.length;
  s.newFrames = s.bobTotal - lastAcc;
  lastAcc = s.bobTotal;
  samples.push(s);
  console.log(`  t=${s.t}s step=${s.step} browserHeap=${s.heapMB?.toFixed(1)} MB serverHeap=${s.serverHeapMB.toFixed(1)} MB Bob frames +${s.newFrames} errors=${s.errors}`);
}
await page.evaluate(() => window.__ciphercam.stopAuto());
await browser.close();
await app.close();

// Memory growth: compare the average of the first third with the last third of the run.
const third = Math.max(1, Math.floor(samples.length / 3));
const avg = (arr, k) => arr.reduce((a, s) => a + (s[k] || 0), 0) / arr.length;
const growth = (k) => (avg(samples.slice(-third), k) - avg(samples.slice(0, third), k)) / avg(samples.slice(0, third), k) * 100;
const result = {
  when: new Date().toISOString(), minutes: MINUTES, samples,
  consoleErrors: errors.slice(0, 20),
  browserHeapGrowthPercent: growth('heapMB'),
  serverHeapGrowthPercent: growth('serverHeapMB'),
  minFramesPer30s: Math.min(...samples.map((s) => s.newFrames)),
};
result.pass = errors.length === 0 && result.minFramesPer30s > 100 && result.browserHeapGrowthPercent < 25 && result.serverHeapGrowthPercent < 50;
fs.mkdirSync(path.join(ROOT, 'docs', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'results', 'soak.json'), JSON.stringify(result, null, 2) + '\n');
const md = `# Soak test

\`npm run soak\` — auto-play looped through all 9 steps for **${MINUTES} minutes** on /stage (1366×768, headless Chromium, synthetic source), ${result.when.slice(0, 16).replace('T', ' ')} UTC.

| Check | Result |
|---|---|
| Console errors (Stage + Alice + Eve + Bob panels) | ${errors.length} |
| Fewest frames Bob accepted in any 30 s window | ${result.minFramesPer30s} |
| Browser JS heap, first third → last third of the run | ${avg(samples.slice(0, third), 'heapMB').toFixed(1)} MB → ${avg(samples.slice(-third), 'heapMB').toFixed(1)} MB (${result.browserHeapGrowthPercent.toFixed(1)} %) |
| Server heap, first third → last third | ${avg(samples.slice(0, third), 'serverHeapMB').toFixed(1)} MB → ${avg(samples.slice(-third), 'serverHeapMB').toFixed(1)} MB (${result.serverHeapGrowthPercent.toFixed(1)} %) |
| **Verdict** | **${result.pass ? 'PASS' : 'FAIL'}** |

Raw samples (every 30 s): \`soak.json\`.
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'results', 'SOAK.md'), md);
console.log(md);
process.exit(result.pass ? 0 : 1);
