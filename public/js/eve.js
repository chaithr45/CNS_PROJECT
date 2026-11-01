// public/js/eve.js — Eve's control panel. Passive views come from eve-view.js;
// the active attacks themselves run in the relay (server/eve-active.js).
import { $, initPage, isEmbed } from '/js/common.js';
import { connectWS } from '/js/net.js';
import { createEveView, EVE_SCREEN_HTML, VIEW_LABELS, VIEW_EXPLAIN } from '/js/eve-view.js';
import { STAMPS, stampPixels } from '/shared/stamps.js';

initPage({ needsCrypto: false });
$('#eveScreen').innerHTML = EVE_SCREEN_HTML;
const view = createEveView({ canvas: $('#eveScreen canvas'), root: document });
let state = null;

const net = connectWS('eve', {
  indicator: $('#conn'),
  onMessage(msg) {
    view.handle(msg);
    if (msg.header.t === 'state') { state = msg.header.state; render(); }
  },
});

// View buttons
for (const [id, label] of Object.entries(VIEW_LABELS)) {
  const b = document.createElement('button');
  b.className = 'btn'; b.dataset.view = id; b.textContent = label;
  b.onclick = () => net.control({ eveView: id });
  $('#views').appendChild(b);
}
// Stamp picker + preview of the mask
for (const [id, label] of Object.entries(STAMPS)) {
  const b = document.createElement('button');
  b.className = 'btn'; b.dataset.stamp = id; b.textContent = label;
  b.onclick = () => net.control({ attacks: { bitflip: { stamp: id } } });
  $('#stamps').appendChild(b);
}
const prev = $('#maskPreview');
prev.width = 160; prev.height = 120;
function drawMask(name) {
  const px = stampPixels(name);
  const g = prev.getContext('2d');
  const img = g.createImageData(160, 120);
  for (let i = 0; i < px.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = px[i]; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}
$('#bitflip').onclick = () => net.control({ attacks: { bitflip: { on: !state.attacks.bitflip.on } } });
$('#rec').onclick = () => net.control({ attacks: { replay: { phase: 'recording', seconds: parseInt($('#secs').value, 10) || 5 } } });
$('#loop').onclick = () => net.control({ attacks: { replay: { phase: 'looping' } } });
$('#stop').onclick = () => net.control({ attacks: { replay: { phase: 'off' } } });
$('#away').onchange = (e) => net.control({ away: e.target.checked });
$('#mitm').onclick = () => net.control({ attacks: { mitm: { on: !state.attacks.mitm.on } } });

let lastStamp = null;
function render() {
  if (!state) return;
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('active', b.dataset.view === state.eveView);
  for (const b of document.querySelectorAll('[data-stamp]')) b.classList.toggle('active', b.dataset.stamp === state.attacks.bitflip.stamp);
  if (lastStamp !== state.attacks.bitflip.stamp) { lastStamp = state.attacks.bitflip.stamp; drawMask(lastStamp); }
  $('#explain').textContent = VIEW_EXPLAIN[state.eveView];
  $('#bitflip').textContent = `Bit-flip: ${state.attacks.bitflip.on ? 'ON ✏' : 'OFF'}`;
  $('#bitflip').classList.toggle('active', state.attacks.bitflip.on);
  $('#mitm').textContent = `MITM: ${state.attacks.mitm.on ? 'ON 🔀' : 'OFF'}${state.attacks.mitm.on && state.mitmActive ? ' (active in this session)' : ''}`;
  $('#mitm').classList.toggle('active', state.attacks.mitm.on);
  $('#away').checked = state.away;
  const r = state.attacks.replay;
  const txt = { off: 'Replay: off', recording: `● Recording… ${r.recorded.toFixed(1)} / ${r.seconds} s`, ready: `Recorded ${r.recorded.toFixed(1)} s — press Loop`, looping: '⟲ LOOPING old frames to Bob (live video blocked)' };
  $('#replayStatus').textContent = txt[r.phase] || r.phase;
}

window.__ciphercam = { role: 'eve', stats: view.stats, get state() { return state; }, embed: isEmbed };
