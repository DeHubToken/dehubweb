import { initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';

let ready;

/**
 * resvg-wasm can be initialised once per isolate; a second initWasm() throws
 * "Already initialized". Every share card waits on this one promise, so the
 * first card rendered in an isolate no longer breaks the others.
 */
export function resvgReady() {
  ready ??= initWasm(wasm).catch((error) => { ready = undefined; throw error; });
  return ready;
}
