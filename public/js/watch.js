// public/js/watch.js — audience phones: Eve's current view, read-only.
// Works over plain http://<laptop-ip>:<port>/watch — needs NO Web Crypto and NO camera.
import { $ } from '/js/common.js';
import { connectWS } from '/js/net.js';
import { createEveView, EVE_SCREEN_HTML } from '/js/eve-view.js';
import { STEPS } from '/shared/steps.js';

$('#eveScreen').innerHTML = EVE_SCREEN_HTML;
const view = createEveView({ canvas: $('#eveScreen canvas'), root: document });
let frames = 0;

connectWS('watch', {
  indicator: $('#conn'),
  onMessage(msg) {
    view.handle(msg);
    if (msg.header.t === 'frame' || msg.header.t === 'eve-plain') frames++;
    if (msg.header.t === 'state') {
      const s = STEPS[msg.header.state.step];
      if (s) { $('#step').textContent = `Step ${s.n} of ${STEPS.length - 1}: ${s.title}`; $('#caption').textContent = s.caption; }
    }
  },
});

window.__ciphercam = { role: 'watch', stats: view.stats, get frames() { return frames; }, secure: window.isSecureContext };
