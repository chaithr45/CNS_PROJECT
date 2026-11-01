// test/helpers.js — shared setup for the Node tests: plug aes-js into shared/ecb.js.
import { createRequire } from 'node:module';
import { setAesJs } from '../shared/ecb.js';

const require = createRequire(import.meta.url);
setAesJs(require('aes-js'));

export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
