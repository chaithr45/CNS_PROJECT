// public/js/net.js — WebSocket connection to the relay, with automatic reconnect.
import { encodeMessage, decodeMessage } from '/shared/protocol.js';

// connectWS(role, { onMessage(msg), onOpen(), onClose() , indicator: element })
export function connectWS(role, { onMessage, onOpen, onClose, indicator } = {}) {
  let ws = null;
  let delay = 400;
  let stopped = false;
  const show = (cls, text) => { if (indicator) { indicator.className = `conn ${cls}`; indicator.textContent = text; } };

  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
    ws.binaryType = 'arraybuffer';
    show('', 'connecting…');
    ws.onopen = () => { delay = 400; show('on', 'connected'); onOpen?.(); };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = decodeMessage(ev.data); } catch { return; }
      try { onMessage?.(msg); } catch (e) { console.error(e); }
    };
    ws.onclose = (ev) => {
      onClose?.(ev);
      if (ev.code === 4000) { stopped = true; show('off', 'replaced by a newer tab'); return; }
      if (ev.code === 4003) { stopped = true; show('off', 'not allowed from this device'); return; }
      if (ev.code === 4029) { stopped = true; show('off', 'too many viewers'); return; }
      if (stopped) return;
      show('off', `reconnecting in ${(delay / 1000).toFixed(1)} s…`);
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
    ws.onerror = () => {};
  }
  open();

  return {
    get bufferedAmount() { return ws ? ws.bufferedAmount : 0; },
    get connected() { return !!ws && ws.readyState === 1; },
    send(header, payload) { if (ws && ws.readyState === 1) { ws.send(encodeMessage(header, payload)); return true; } return false; },
    sendRaw(bytes) { if (ws && ws.readyState === 1) { ws.send(bytes); return true; } return false; },
    control(patch) { return this.send({ t: 'control', patch }); },
    restart() { return this.send({ t: 'restart' }); },
    event(text, level = 'info') { return this.send({ t: 'event', text, level }); },
    close() { stopped = true; ws?.close(); },
  };
}
