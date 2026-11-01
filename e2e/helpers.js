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

// Layout check for the Stage (and solo) page: inside every container, the visible children
// must not overlap each other or stick out, nothing may leave the window, and no label or
// button text may be cut off. Returns a list of human-readable problems (empty = fine).
export function layoutProblems(page) {
  return page.evaluate(() => {
    const problems = [];
    const vis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const name = (el) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].map((c) => '.' + c).join('')}`);
    const inside = (a, b, tol = 1) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
    const overlap = (a, b, tol = 1) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tol && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tol;
    const win = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const containers = ['.st-wrap', '.st-head', '.st-panels', '.st-panel', '.st-info', '.st-box', '.st-safety', '.st-counts', '.st-side', '.st-steps', '.st-sub', '.st-nav', '.st-cam', '.st-field', '.st-qr', '.st-caption'];
    for (const sel of containers) for (const c of document.querySelectorAll(sel)) {
      if (!vis(c)) continue;
      const cr = c.getBoundingClientRect();
      if (!inside(cr, win)) problems.push(`${name(c)} goes outside the window`);
      const kids = [...c.children].filter((k) => vis(k) && !['absolute', 'fixed'].includes(getComputedStyle(k).position));
      for (const k of kids) if (!inside(k.getBoundingClientRect(), cr)) problems.push(`${name(k)} sticks out of ${name(c)}`);
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        if (overlap(kids[i].getBoundingClientRect(), kids[j].getBoundingClientRect())) problems.push(`${name(kids[i])} overlaps ${name(kids[j])}`);
      }
    }
    for (const el of document.querySelectorAll('.st-label, .st-box-title, .st-steps button, .st-nav .btn, .st-sub .btn, .st-verdict, #modeBadge, #stepBadge, .st-cap-title, .st-cap-text')) {
      if (vis(el) && el.scrollWidth > el.clientWidth + 1) problems.push(`${name(el)} text is cut off ("${el.textContent.trim().slice(0, 40)}")`);
    }
    const ov = document.getElementById('overlay');
    if (ov && vis(ov) && !inside(ov.getBoundingClientRect(), document.querySelector('.st-panels').getBoundingClientRect())) problems.push('#overlay sticks out of the panels');
    return problems;
  });
}
