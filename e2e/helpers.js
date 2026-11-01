// e2e/helpers.js — shared helpers for the Playwright tests.
import os from 'node:os';
import { connect, waitFor } from '../test/sim-clients.js';

export const PORT = 8199;
export { waitFor };

// A Node WebSocket client acting as the Stage, to send control patches.
export async function controller() {
  const c = connect(PORT, 'stage');
  await c.open;
  await waitFor(() => c.state, 5000, 'state');
  return c;
}

export function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return a.address;
  }
  return null;
}

// Collect console errors and page errors so tests can assert there were none.
export function watchErrors(page, name, list) {
  page.on('console', (m) => { if (m.type() === 'error') list.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => list.push(`${name} pageerror: ${e.message}`));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
