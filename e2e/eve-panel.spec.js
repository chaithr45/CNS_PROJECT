// e2e/eve-panel.spec.js — Eve's attack buttons, clicked like a human would.
import { test, expect } from '@playwright/test';
import { controller, watchErrors, sleep } from './helpers.js';

test('Eve panel: bit-flip stamp, replay record/loop/stop, MITM toggle', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  const p = {};
  for (const role of ['alice', 'bob', 'eve']) { p[role] = await ctx.newPage(); watchErrors(p[role], role, errors); await p[role].goto(`/${role}`); }
  const ctl = await controller();
  const bob = () => p.bob.evaluate(() => ({ c: { ...window.__ciphercam.counts }, last: window.__ciphercam.last, safety: window.__ciphercam.safety }));
  const st = () => p.eve.evaluate(() => window.__ciphercam.state);

  // --- P4.1 bit-flip in CTR: Bob accepts the stamped frames
  ctl.control({ mode: 'ctr', restart: true, attacks: { bitflip: { on: false }, mitm: { on: false } } });
  await expect.poll(async () => (await bob()).c.accepted, { timeout: 10_000 }).toBeGreaterThan(12);
  await p.eve.getByRole('button', { name: 'HACKED' }).click();
  await p.eve.getByRole('button', { name: /Bit-flip: OFF/ }).click();
  await expect.poll(async () => (await st()).attacks.bitflip).toEqual({ on: true, stamp: 'hacked' });
  await sleep(1500);
  expect((await bob()).last.ok).toBe(true);
  await p.bob.screenshot({ path: 'docs/screenshots/attack-bitflip-ctr-bob.png' });
  // ... and in GCM the same click is rejected
  ctl.control({ mode: 'gcm', restart: true });
  await expect.poll(async () => (await bob()).c.tamper, { timeout: 10_000 }).toBeGreaterThan(5);
  await p.bob.screenshot({ path: 'docs/screenshots/attack-bitflip-gcm-bob.png' });
  await p.eve.getByRole('button', { name: /Bit-flip: ON/ }).click();
  await expect.poll(async () => (await st()).attacks.bitflip.on).toBe(false);

  // --- P4.2 replay: record 2 s, loop, stop (GCM rejects)
  await p.eve.locator('#secs').fill('2');
  await p.eve.getByRole('button', { name: '● Record' }).click();
  await expect.poll(async () => (await st()).attacks.replay.phase, { timeout: 6000 }).toBe('ready');
  await p.eve.getByRole('button', { name: '⟲ Loop' }).click();
  await expect.poll(async () => (await bob()).c.replay, { timeout: 6000 }).toBeGreaterThan(5);
  await p.bob.screenshot({ path: 'docs/screenshots/attack-replay-gcm-bob.png' });
  await p.eve.screenshot({ path: 'docs/screenshots/eve-panel.png' });
  await p.eve.getByRole('button', { name: '■ Stop' }).click();
  await expect.poll(async () => (await st()).attacks.replay.phase).toBe('ready');
  const acc = (await bob()).c.accepted;
  await expect.poll(async () => (await bob()).c.accepted, { timeout: 5000 }).toBeGreaterThan(acc + 5);

  // --- P4.3 MITM toggle: restarts, Bob still accepts, safety numbers differ
  await p.eve.getByRole('button', { name: /MITM: OFF/ }).click();
  await expect.poll(async () => (await st()).mitmActive, { timeout: 5000 }).toBe(true);
  await expect.poll(async () => p.eve.evaluate(() => window.__ciphercam.stats.eveHasKey), { timeout: 10_000 }).toBe(true);
  const aliceSafety = await p.alice.evaluate(() => window.__ciphercam.safety);
  const b = await bob();
  expect(b.last.ok).toBe(true);
  expect(b.safety).not.toBe(aliceSafety);
  await p.eve.screenshot({ path: 'docs/screenshots/attack-mitm-eve.png' });
  await p.eve.getByRole('button', { name: /MITM: ON/ }).click();
  await expect.poll(async () => (await st()).mitmActive, { timeout: 5000 }).toBe(false);
  await expect.poll(async () => (await bob()).safety === (await p.alice.evaluate(() => window.__ciphercam.safety)) && (await bob()).safety !== null, { timeout: 10_000 }).toBe(true);
  ctl.close();
  expect(errors).toEqual([]);
  await ctx.close();
});
