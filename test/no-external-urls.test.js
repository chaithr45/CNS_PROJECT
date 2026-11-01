// test/no-external-urls.test.js — the demo must work offline: no page may load anything
// from the internet. Scans every served file in public/ and shared/ for http:// or https://
// URLs pointing at another host. Comments are ignored; localhost and URLs built from the
// page's own address (`http://${location.host}`) are fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(html|js|css|json|svg)$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(text, ext) {
  if (ext === '.html') text = text.replace(/<!--[\s\S]*?-->/g, '');
  if (ext === '.js' || ext === '.css' || ext === '.html') text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  if (ext === '.js' || ext === '.html') text = text.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'); // line comments, not "http://"
  return text;
}

test('no external URLs in public/ and shared/ (works offline)', () => {
  const bad = [];
  for (const f of [...files(path.join(ROOT, 'public')), ...files(path.join(ROOT, 'shared'))]) {
    const text = stripComments(fs.readFileSync(f, 'utf8'), path.extname(f));
    for (const m of text.matchAll(/https?:\/\/([^\s'"`)<>]*)/g)) {
      const host = m[1];
      const ok = host === '' || host.startsWith('${') || /^(localhost|127\.0\.0\.1)([:/]|$)/.test(host);
      if (!ok) bad.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('HTML pages load scripts and styles only from this server', () => {
  for (const f of files(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(m[1].startsWith('/') || m[1].startsWith('#') || m[1].startsWith('?'), `${path.basename(f)} references ${m[1]}`);
    }
  }
});

test('the scanner itself catches an external URL', () => {
  const text = stripComments('const x = "https://cdn.example.com/lib.js"; // https://ok-in-comment.com', '.js');
  assert.ok(/https:\/\/cdn\.example\.com/.test(text));
  assert.ok(!/ok-in-comment/.test(text));
});
