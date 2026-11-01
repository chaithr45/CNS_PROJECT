// public/js/landing.js — the start page: links + QR code for /watch.
import { $ } from '/js/common.js';

async function showQr(url) {
  $('#url').textContent = url;
  const svg = await (await fetch(`/api/qr.svg?text=${encodeURIComponent(url)}`)).text();
  $('#qr').innerHTML = svg;
}

const info = await (await fetch('/api/info')).json();
const sel = $('#ip');
const options = info.lan.length ? info.lan : [{ name: 'this laptop only', ip: location.hostname, url: `http://${location.host}/watch` }];
for (const l of options) {
  const o = document.createElement('option');
  o.value = l.url; o.textContent = `${l.ip} (${l.name})`;
  sel.appendChild(o);
}
sel.onchange = () => showQr(sel.value);
showQr(options[0].url);
