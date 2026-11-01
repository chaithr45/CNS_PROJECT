// solo/build.js — build the static "solo mode" site (npm run build:solo) into dist-solo/.
// The result needs no server at all: Alice, the relay with Eve's attacks, and Bob all run
// in one page. Upload dist-solo/ to GitHub Pages, Vercel, Netlify or any static host
// (it must be served over HTTPS, because Web Crypto and the camera need a secure context).
//
// Absolute paths such as /shared/frame.js are rewritten to relative ones, so the site also
// works in a sub-folder (e.g. https://<user>.github.io/<repo>/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-solo');
fs.rmSync(OUT, { recursive: true, force: true });

// [source, destination] pairs (relative to the project root / OUT).
const files = [
  ['public/solo.html', 'index.html'],
  ['public/css/app.css', 'css/app.css'],
  ['public/css/stage.css', 'css/stage.css'],
  ['public/js/common.js', 'js/common.js'],
  ['public/js/eve-view.js', 'js/eve-view.js'],
  ['public/js/solo.js', 'js/solo.js'],
  ['server/eve-active.js', 'server/eve-active.js'],
];
for (const f of fs.readdirSync(path.join(ROOT, 'shared'))) if (f.endsWith('.js')) files.push([`shared/${f}`, `shared/${f}`]);

// From a file at depth d (0 = site root), "/x" becomes "./x" (d = 0) or "../x" (d = 1).
function relativize(text, depth) {
  const up = depth === 0 ? './' : '../'.repeat(depth);
  return text
    .replace(/(from\s+|import\s*\(\s*)'\/(shared|js|server)\//g, `$1'${up}$2/`)
    .replace(/(href|src)="\/(css|js|vendor)\//g, `$1="${up}$2/`);
}

for (const [src, dst] of files) {
  const out = path.join(OUT, dst);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const depth = dst.split('/').length - 1;
  fs.writeFileSync(out, relativize(fs.readFileSync(path.join(ROOT, src), 'utf8'), depth));
}
const aes = createRequire(import.meta.url).resolve('aes-js');
fs.mkdirSync(path.join(OUT, 'vendor', 'aes-js'), { recursive: true });
fs.copyFileSync(aes, path.join(OUT, 'vendor', 'aes-js', 'index.js'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve files as they are

// Safety net: no absolute /shared, /js, /css, /vendor or /server paths may remain.
const left = [];
for (const [, dst] of files) {
  const t = fs.readFileSync(path.join(OUT, dst), 'utf8');
  if (/['"]\/(shared|js|css|vendor|server)\//.test(t)) left.push(dst);
}
if (left.length) { console.error('Absolute paths left in:', left); process.exit(1); }
console.log(`Built solo mode into ${path.relative(ROOT, OUT)}/ (${files.length + 1} files). Open it over HTTPS, or test locally with:  npx serve dist-solo`);
