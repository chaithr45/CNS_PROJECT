// e2e/smoke.spec.js — Bob shows frames in every mode; /watch works over the LAN IP.
import { test, expect } from '@playwright/test';
import { controller, watchErrors, lanIp, PORT } from './helpers.js';
import { MODE_IDS } from '../shared/crypto.js';

test('Bob receives and shows frames in every mode (Alice, Eve, Bob pages)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  const pages = {};
  for (const role of ['alice', 'bob', 'eve']) {
    pages[role] = await ctx.newPage();
    watchErrors(pages[role], role, errors);
    await pages[role].goto(`/${role}`);
  }
  const ctl = await controller();
  for (const mode of MODE_IDS) {
    ctl.control({ mode, restart: true, eveView: mode === 'ecb' ? 'blocks' : 'raw' });
    await expect.poll(() => pages.bob.evaluate(() => window.__ciphercam.mode), { timeout: 10_000 }).toBe(mode);
    const before = await pages.bob.evaluate(() => window.__ciphercam.counts.accepted);
    await expect.poll(async () => (await pages.bob.evaluate(() => window.__ciphercam.counts.accepted)) - before, { timeout: 10_000 }).toBeGreaterThan(15);
    const st = await pages.bob.evaluate(() => ({ last: window.__ciphercam.last, c: window.__ciphercam.counts }));
    expect(st.last.ok, `${mode}: ${st.last.reason}`).toBe(true);
    expect(st.c.tamper + st.c.replay + st.c.decrypt).toBe(0);
    await pages.bob.screenshot({ path: `docs/screenshots/smoke-bob-${mode}.png` });
  }
  // Pictures of the separate pages for docs/HOW_TO_TEST.md
  ctl.control({ mode: 'gcm', restart: true, eveView: 'raw' });
  await expect.poll(() => pages.bob.evaluate(() => window.__ciphercam.mode), { timeout: 10_000 }).toBe('gcm');
  await pages.alice.waitForTimeout(2500);
  await pages.alice.screenshot({ path: 'docs/screenshots/page-alice.png' });
  await pages.bob.screenshot({ path: 'docs/screenshots/page-bob.png' });
  await pages.eve.screenshot({ path: 'docs/screenshots/page-eve.png' });
  const home = await ctx.newPage();
  await home.goto('/');
  await home.waitForTimeout(800);
  await home.screenshot({ path: 'docs/screenshots/page-home.png' });
  ctl.close();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('/watch works from the LAN address (not a secure context) and renders frames', async ({ browser }) => {
  const ip = lanIp();
  test.skip(!ip, 'no non-loopback IPv4 address in this machine');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  const alice = await ctx.newPage(); watchErrors(alice, 'alice', errors); await alice.goto('/alice');
  const bob = await ctx.newPage(); watchErrors(bob, 'bob', errors); await bob.goto('/bob');
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const phone = await phoneCtx.newPage(); watchErrors(phone, 'watch', errors);
  await phone.goto(`http://${ip}:${PORT}/watch`);
  expect(await phone.evaluate(() => window.isSecureContext)).toBe(false);
  await expect.poll(() => phone.evaluate(() => window.__ciphercam.frames), { timeout: 15_000 }).toBeGreaterThan(3);
  await phone.screenshot({ path: 'docs/screenshots/watch-phone.png' });
  // A phone must not be able to change anything.
  const sentForbidden = await phone.evaluate(() => new Promise((res) => {
    const ws = new WebSocket(`ws://${location.host}/ws?role=stage`);
    ws.onclose = (e) => res(e.code);
  }));
  expect(sentForbidden).toBe(4003);
  expect(errors).toEqual([]);
  await phoneCtx.close();
  await ctx.close();
});
