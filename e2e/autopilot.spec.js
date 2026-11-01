// e2e/autopilot.spec.js — the whole demo on /stage, driven by the keyboard like the presenter,
// with every step's promise checked through window.__ciphercam and screenshots saved.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { watchErrors, controller, sleep, layoutProblems } from './helpers.js';
import { STEPS } from '../shared/steps.js';

const RES = [[1366, 768], [1920, 1080]];
const hook = (page, fn) => page.evaluate(fn);

async function openStage(browser, w, h, errors) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  watchErrors(page, `stage-${w}`, errors);
  await page.goto('/stage');
  await expect.poll(() => hook(page, () => window.__ciphercam.bob?.counts.accepted || 0), { timeout: 20_000 }).toBeGreaterThan(5);
  await page.locator('.st-caption').click(); // focus the Stage so the keys reach it
  return { ctx, page };
}

// Wait until the step's promise (STEPS[n].expect) is visibly true.
async function checkStep(page, n) {
  const e = STEPS[n].expect || {};
  const t = { timeout: 20_000 };
  await expect.poll(() => hook(page, () => window.__ciphercam.step), t).toBe(n);
  // wait for the new session to be up: Bob accepting frames of the right mode
  if (e.bobOk) {
    await expect.poll(() => hook(page, () => {
      const c = window.__ciphercam; const s = c.state;
      return !!(c.bob && c.bob.last.ok && c.bob.sid === s.sid && c.bob.mode === s.mode && Date.now() - c.bob.lastOkAt < 1000);
    }), t).toBe(true);
  }
  // Past the 1-second "Connecting…" splash: live video is flowing in this session.
  await expect.poll(() => hook(page, () => window.__ciphercam.alice?.sid === window.__ciphercam.state.sid && window.__ciphercam.alice.seq >= 16), t).toBe(true);
  // Alice, Eve and Bob are all in the same (new) session.
  await expect.poll(() => hook(page, () => { const c = window.__ciphercam; return c.eve.stats.sid === c.state.sid && c.bob.sid === c.state.sid; }), t).toBe(true);
  expect(await hook(page, () => window.__ciphercam.state.mitmActive)).toBe(!!STEPS[n].config.attacks?.mitm?.on);
  if (e.leakMin !== undefined) await expect.poll(() => hook(page, () => window.__ciphercam.leak), t).toBeGreaterThan(e.leakMin);
  if (e.leakMax !== undefined) {
    await expect.poll(() => hook(page, () => window.__ciphercam.eve.stats.mode === window.__ciphercam.state.mode && window.__ciphercam.eve.stats.frames > 12), t).toBe(true);
    expect(await hook(page, () => window.__ciphercam.leak)).toBeLessThan(e.leakMax);
  }
  if (e.nonceReuse) await expect.poll(() => hook(page, () => !!window.__ciphercam.eve.stats.nonceReuse), t).toBe(true);
  if (e.keystream) await expect.poll(() => hook(page, () => window.__ciphercam.eve.stats.keystream), t).toBe('recovered');
  if (e.bitflip) expect(await hook(page, () => window.__ciphercam.state.attacks.bitflip.on)).toBe(true);
  if (e.replayLooping) {
    await expect.poll(() => hook(page, () => window.__ciphercam.state.attacks.replay.phase), { timeout: 25_000 }).toBe('looping');
    expect(await hook(page, () => window.__ciphercam.state.away)).toBe(true);
    const before = await hook(page, () => window.__ciphercam.counters.accepted);
    await sleep(2500);
    const st = await hook(page, () => ({ acc: window.__ciphercam.counters.accepted, last: window.__ciphercam.bobLast }));
    expect(st.acc, 'Bob keeps accepting the looped frames').toBeGreaterThan(before + 10);
    expect(st.last.ok).toBe(true);
  }
  if (e.rejectedTamper) await expect.poll(() => hook(page, () => window.__ciphercam.counters.tamper), { timeout: 25_000 }).toBeGreaterThan(5);
  if (e.rejectedReplay) await expect.poll(() => hook(page, () => window.__ciphercam.counters.replay), { timeout: 25_000 }).toBeGreaterThan(5);
  if (e.safety) await expect.poll(() => hook(page, () => window.__ciphercam.safetyMatch), t).toBe(e.safety === 'match');
  if (e.eveHasKey) await expect.poll(() => hook(page, () => window.__ciphercam.eve.stats.eveHasKey), t).toBe(true);
}

for (const [w, h] of RES) {
  test(`autopilot: every step at ${w}×${h} (keyboard, assertions, screenshots)`, async ({ browser }) => {
    const errors = [];
    const { ctx, page } = await openStage(browser, w, h, errors);
    // R resets to step 1; 0 jumps to step 0; → walks through the rest.
    await page.keyboard.press('r');
    await expect.poll(() => hook(page, () => window.__ciphercam.step)).toBe(1);
    await page.keyboard.press('0');
    const numbers = [];
    for (let n = 0; n < STEPS.length; n++) {
      if (n > 0) await page.keyboard.press('ArrowRight');
      await checkStep(page, n);
      // Every step is a new session with new ECDH keys → a new safety number.
      await expect.poll(() => hook(page, () => window.__ciphercam.safetyMatch), { timeout: 20_000 }).not.toBeNull();
      numbers.push(await hook(page, () => window.__ciphercam.safety.alice));
      await sleep(n === 2 || n === 3 ? 1500 : 600);
      const dims = await hook(page, () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
      expect(dims, 'Stage fits the screen without scrolling').toEqual([w, h]);
      expect(await layoutProblems(page), `step ${n} at ${w}×${h}: no overlapping or cut-off elements`).toEqual([]);
      await page.screenshot({ path: `docs/screenshots/step-${n}-${w}.png` });
    }
    expect(new Set(numbers).size, `fresh safety number per step: ${numbers.join(' | ')}`).toBe(STEPS.length);
    // Step 6 sub-action buttons work on their own too.
    await page.keyboard.press('6');
    await checkStep(page, 6);
    // ← goes back
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => hook(page, () => window.__ciphercam.step)).toBe(5);
    // F toggles the clean view, ? the help overlay
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/clean/);
    expect(await layoutProblems(page), 'clean view: no overlapping elements').toEqual([]);
    await page.screenshot({ path: `docs/screenshots/clean-${w}.png` });
    await page.keyboard.press('f');
    await page.keyboard.press('?');
    await expect(page.locator('#help')).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/help-${w}.png` });
    await page.keyboard.press('Escape');
    // A starts auto-play at step 0, A again stops it.
    await page.keyboard.press('a');
    await expect.poll(() => hook(page, () => window.__ciphercam.autoplay)).toBe(true);
    await expect.poll(() => hook(page, () => window.__ciphercam.step)).toBe(0);
    await page.keyboard.press('a');
    await expect.poll(() => hook(page, () => window.__ciphercam.autoplay)).toBe(false);
    await page.keyboard.press('r');
    await expect.poll(() => hook(page, () => window.__ciphercam.step)).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('step 6 sub-actions: "Try bit-flip" and "Try replay" are both rejected', async ({ browser }) => {
  const errors = [];
  const { ctx, page } = await openStage(browser, 1366, 768, errors);
  await page.keyboard.press('6');
  await expect.poll(() => hook(page, () => window.__ciphercam.step)).toBe(6);
  await page.getByRole('button', { name: 'Try bit-flip' }).click();
  await expect.poll(() => hook(page, () => window.__ciphercam.counters.tamper), { timeout: 15_000 }).toBeGreaterThan(3);
  await sleep(3800);
  await page.getByRole('button', { name: 'Try replay' }).click();
  await expect.poll(() => hook(page, () => window.__ciphercam.counters.replay), { timeout: 15_000 }).toBeGreaterThan(3);
  await expect(page.locator('#bobAlert')).toContainText('REPLAY REJECTED');
  // Regression: leaving the step clears Bob's old alert and counters on the Stage at once.
  await page.keyboard.press('8');
  await page.waitForTimeout(300);
  expect(await page.locator('#bobAlert').textContent()).not.toContain('REJECTED');
  expect(await page.locator('#cRep').textContent()).toBe('⟲ replayed 0');
  expect(await page.locator('#cTam').textContent()).toBe('🛡 tampered 0');
  await page.keyboard.press('r');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('performance: Bob sustains the frame rate with all three Stage panels open', async ({ browser }) => {
  const errors = [];
  const { ctx, page } = await openStage(browser, 1366, 768, errors);
  await page.keyboard.press('8'); // the heaviest mode: AES-GCM with checks
  await expect.poll(() => hook(page, () => window.__ciphercam.safetyMatch), { timeout: 20_000 }).toBe(true);
  await sleep(2000);
  const samples = [];
  for (let i = 0; i < 10; i++) { await sleep(1000); samples.push(await hook(page, () => window.__ciphercam.bob.fps)); }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const lat = await hook(page, () => window.__ciphercam.bob.latency);
  fs.mkdirSync('docs/results', { recursive: true });
  fs.writeFileSync('docs/results/e2e-fps.json', JSON.stringify({ when: new Date().toISOString(), mode: 'gcm', panels: 3, samples, averageFps: avg, latencyMs: lat, machine: `${process.platform} ${process.arch}, headless Chromium` }, null, 2) + '\n');
  expect(avg).toBeGreaterThanOrEqual(9);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('fake camera source: the whole pipeline works with a (fake) webcam', async ({ browser }) => {
  const errors = [];
  const { ctx, page } = await openStage(browser, 1366, 768, errors);
  const ctl = await controller();
  ctl.control({ source: 'webcam' });
  await expect.poll(() => hook(page, () => window.__ciphercam.alice.source), { timeout: 15_000 }).toBe('webcam');
  for (const n of [2, 4, 8]) {
    await page.keyboard.press(String(n));
    await checkStep(page, n);
    await sleep(1500);
    await page.screenshot({ path: `docs/screenshots/fakecam-step-${n}.png` });
  }
  ctl.control({ source: 'synthetic' });
  await expect.poll(() => hook(page, () => window.__ciphercam.alice.source)).toBe('synthetic');
  ctl.close();
  expect(errors).toEqual([]);
  await ctx.close();
});
