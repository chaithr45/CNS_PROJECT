#!/usr/bin/env node
// server/index.js — start CipherCam from the command line.
//
//   node server/index.js [--port 8080] [--no-open] [--allow-remote-control] [--host 0.0.0.0]
//
// `npm run demo` runs this and opens the Stage page in your default browser.
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';
import { createCipherServer } from './app.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };

const port = parseInt(value('--port', process.env.PORT || '8080'), 10);
const host = value('--host', '0.0.0.0');
const open = !flag('--no-open');
const allowRemoteControl = flag('--allow-remote-control');

function openBrowser(url) {
  try {
    let child;
    if (process.platform === 'win32') child = spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    else if (process.platform === 'darwin') child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    else child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log(`  (Could not open a browser automatically. Open ${url} yourself.)`));
    child.unref();
  } catch {
    console.log(`  (Could not open a browser automatically. Open ${url} yourself.)`);
  }
}

let app;
try {
  app = await createCipherServer({ port, host, allowRemoteControl });
} catch (e) {
  console.error(`\n  Could not start the server: ${e.message}`);
  console.error(`  Ports ${port}-${port + 10} all seem busy. Close other CipherCam windows, or run with --port 9000.\n`);
  process.exit(1);
}

const stage = `http://localhost:${app.port}/stage`;
const lan = app.lanInfo();
console.log('');
console.log('  ==============================================================');
console.log('   CipherCam is running');
console.log('  ==============================================================');
if (app.port !== port) console.log(`   (Port ${port} was busy, so CipherCam is using port ${app.port}.)`);
console.log(`   Stage (projector):   ${stage}`);
console.log(`   Landing page:        http://localhost:${app.port}/`);
if (lan.length) {
  console.log('   Audience phones (same Wi-Fi / hotspot) open:');
  for (const l of lan) console.log(`     ${l.url}   (${l.name})`);
  try {
    const qr = await QRCode.toString(lan[0].url, { type: 'terminal', small: true });
    console.log(qr.split('\n').map((l) => '     ' + l).join('\n'));
  } catch { /* QR is optional */ }
} else {
  console.log('   (No network found: audience phones cannot join, the laptop demo still works.)');
}
if (allowRemoteControl) console.log('   WARNING: --allow-remote-control is ON: any device can change the demo.');
console.log('   Press Ctrl+C to stop');
console.log('  ==============================================================');
console.log('');

if (open) openBrowser(stage);

const stop = async () => { console.log('\n  Stopping CipherCam…'); await app.close().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
