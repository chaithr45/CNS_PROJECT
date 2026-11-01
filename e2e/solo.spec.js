// e2e/solo.spec.js — optional single-page "solo mode" (no server relay) runs every attack.
import { test, expect } from '@playwright/test';
import { watchErrors, layoutProblems } from './helpers.js';

const h = (page, fn) => page.evaluate(fn);

test('solo mode: ECB leak, nonce reuse, bit-flip, GCM rejections and MITM all work in one page', async ({ page }) => {
  const errors = [];
  watchErrors(page, 'solo', errors);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/solo');
  await expect.poll(() => h(page, () => window.__ciphercam.counts.accepted), { timeout: 15_000 }).toBeGreaterThan(5);
  await page.keyboard.press('2');
  await expect.poll(() => h(page, () => window.__ciphercam.leak), { timeout: 15_000 }).toBeGreaterThan(50);
  await page.screenshot({ path: 'docs/screenshots/solo-step-2.png' });
  await page.keyboard.press('3');
  await expect.poll(() => h(page, () => window.__ciphercam.eve.keystream), { timeout: 15_000 }).toBe('recovered');
  await page.keyboard.press('4');
  await expect.poll(() => h(page, () => window.__ciphercam.counts.accepted), { timeout: 15_000 }).toBeGreaterThan(15);
  await page.keyboard.press('6');
  await expect.poll(() => h(page, () => window.__ciphercam.counts.tamper), { timeout: 20_000 }).toBeGreaterThan(5);
  await expect.poll(() => h(page, () => window.__ciphercam.counts.replay), { timeout: 20_000 }).toBeGreaterThan(5);
  // Regression: a step change starts a fresh session — Bob's old REPLAY alert, red bar and
  // counters must be gone at once (they used to linger for 1.5 s into the next step).
  await expect(page.locator('#bobAlert')).toContainText('REJECTED');
  await page.keyboard.press('1');
  await page.waitForTimeout(150);
  expect(await page.locator('#bobAlert').textContent()).not.toContain('REJECTED');
  await expect(page.locator('#bobBar')).toBeHidden();
  const fresh = await h(page, () => ({ ...window.__ciphercam.counts }));
  expect(fresh.replay + fresh.tamper + fresh.decrypt).toBe(0);
  await page.keyboard.press('7');
  await expect.poll(() => h(page, () => window.__ciphercam.safetyMatch), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => h(page, () => window.__ciphercam.eve.eveHasKey), { timeout: 15_000 }).toBe(true);
  expect(await layoutProblems(page), 'solo page: no overlapping or cut-off elements').toEqual([]);
  await page.screenshot({ path: 'docs/screenshots/solo-step-7.png' });
  await page.keyboard.press('8');
  await expect.poll(() => h(page, () => window.__ciphercam.safetyMatch), { timeout: 15_000 }).toBe(true);
  const dims = await h(page, () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  expect(dims).toEqual([1366, 768]);
  expect(errors).toEqual([]);
});
