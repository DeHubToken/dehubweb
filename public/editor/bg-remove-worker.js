/*
 * Background removal, entirely on the user's device.
 *
 * Nothing is uploaded or billed; the page never freezes because this runs in a
 * module worker. Models download once and are then served from the browser's
 * cache.
 *
 *   1. BiRefNet Lite (MIT, ~115 MB fp16) on WebGPU. Any subject, best edges.
 *      Only on WebGPU: its input is fixed at 1024px and on WASM it runs out of
 *      memory (std::bad_alloc, measured). Some GPUs also fail at run time
 *      ("Too many storage buffers in shader. Current: 17, Max is 16",
 *      measured). After a GPU failure the ONNX runtime in this worker stays
 *      tied to WebGPU (the CPU model then failed with the same shader error,
 *      measured), so the page throws the worker away and starts a fresh one
 *      in "lite" mode. See src/lib/editor/removeBackground.ts.
 *   2. MODNet (Apache-2.0, 6.6 MB uint8) on WASM. Works everywhere (~4s on a
 *      laptop CPU), strongest on people.
 *
 * transformers.js (Apache-2.0) is loaded from a pinned jsdelivr URL rather
 * than bundled: it is large, and only people who press "Remove background"
 * should download it.
 *
 * In:  { id, blob, mode: 'hd' | 'lite' }   one worker only ever runs one mode
 * Out: { id, type: 'progress', loaded, total } | { id, type: 'running' }
 *      { id, type: 'done', blob, model } | { id, type: 'error', message }
 */
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const MODELS = {
  hd: { id: 'onnx-community/BiRefNet_lite-ONNX', device: 'webgpu', dtype: 'fp16' },
  lite: { id: 'Xenova/modnet', device: 'wasm', dtype: 'uint8' },
};

let libPromise = null;
const pipes = {};

function lib() {
  if (!libPromise) {
    libPromise = import(LIB_URL).then((T) => {
      T.env.allowLocalModels = false;
      return T;
    });
    libPromise.catch(() => {
      libPromise = null;
    });
  }
  return libPromise;
}

function getPipe(key, onProgress) {
  if (pipes[key]) return pipes[key];
  const files = {};
  const progress_callback = (p) => {
    if (p && p.status === 'progress' && p.file && p.total) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total };
      let loaded = 0;
      let total = 0;
      for (const f of Object.values(files)) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress(loaded, total);
    }
  };
  const { id, device, dtype } = MODELS[key];
  pipes[key] = lib().then((T) => T.pipeline('background-removal', id, { device, dtype, progress_callback }));
  pipes[key].catch(() => {
    delete pipes[key];
  });
  return pipes[key];
}

self.onmessage = async (event) => {
  const { id, blob, mode } = event.data || {};
  const model = mode === 'hd' ? 'hd' : 'lite';
  try {
    const T = await lib();
    const image = await T.RawImage.fromBlob(blob);
    const pipe = await getPipe(model, (loaded, total) => self.postMessage({ id, type: 'progress', loaded, total }));
    self.postMessage({ id, type: 'running' });
    const out = await pipe(image);
    const result = Array.isArray(out) ? out[0] : out;
    const png = await result.toBlob('image/png');
    self.postMessage({ id, type: 'done', blob: png, model });
  } catch (e) {
    self.postMessage({ id, type: 'error', model, message: String((e && e.message) || e) });
  }
};
