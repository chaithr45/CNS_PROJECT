// e2e/selftest.spec.js — the in-browser known-answer tests all pass in Chromium.
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.js';

test('/selftest: every primitive passes its known-answer test in the browser', async ({ page }) => {
  const errors = [];
  watchErrors(page, 'selftest', errors);
  await page.goto('/selftest');
  await expect.poll(() => page.evaluate(() => window.__selftest?.done), { timeout: 20_000 }).toBe(true);
  const r = await page.evaluate(() => window.__selftest);
  expect(r.fail, JSON.stringify(r.results.filter((x) => !x.ok))).toBe(0);
  expect(r.pass).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: 'docs/screenshots/selftest.png', fullPage: true });
  expect(errors).toEqual([]);
});
