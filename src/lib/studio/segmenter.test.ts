import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const isSimdSupported = vi.fn<() => Promise<boolean>>();
const createFromOptions = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { isSimdSupported: () => isSimdSupported() },
  ImageSegmenter: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

import { createPersonSegmenter, SELFIE_SEGMENTER_MODEL_URL } from './segmenter';

const mask = (values: number[], width = values.length, height = 1) => ({
  width,
  height,
  getAsFloat32Array: () => new Float32Array(values),
});

function fakeTask(confidenceMasks: ReturnType<typeof mask>[]) {
  return {
    segmentForVideo: vi.fn((_input: unknown, _ts: number, cb: (r: unknown) => void) => cb({ confidenceMasks })),
    close: vi.fn(),
  };
}

beforeEach(() => {
  isSimdSupported.mockReset();
  createFromOptions.mockReset();
});

describe('createPersonSegmenter', () => {
  it('serves the model and the runtime from our own origin', async () => {
    isSimdSupported.mockResolvedValue(true);
    createFromOptions.mockResolvedValue(fakeTask([]));
    await createPersonSegmenter();

    const [fileset, options] = createFromOptions.mock.calls[0];
    expect(SELFIE_SEGMENTER_MODEL_URL).toMatch(/^\/models\/selfie_segmenter_float16_v1\.tflite$/);
    expect(options.baseOptions.modelAssetPath).toBe(SELFIE_SEGMENTER_MODEL_URL);
    expect(options.runningMode).toBe('VIDEO');
    expect(fileset.wasmLoaderPath).toMatch(/vision_wasm_internal\.js/);
    expect(fileset.wasmBinaryPath).toMatch(/vision_wasm_internal\.wasm/);
    for (const url of [fileset.wasmLoaderPath, fileset.wasmBinaryPath]) {
      expect(url).not.toMatch(/^https?:/);
    }
  });

  it('loads the scalar build where WASM SIMD is missing', async () => {
    isSimdSupported.mockResolvedValue(false);
    createFromOptions.mockResolvedValue(fakeTask([]));
    await createPersonSegmenter();
    const [fileset] = createFromOptions.mock.calls[0];
    expect(fileset.wasmLoaderPath).toMatch(/vision_wasm_nosimd_internal\.js/);
    expect(fileset.wasmBinaryPath).toMatch(/vision_wasm_nosimd_internal\.wasm/);
  });

  it('prefers the GPU and falls back to the CPU', async () => {
    isSimdSupported.mockResolvedValue(true);
    createFromOptions.mockRejectedValueOnce(new Error('no WebGL2')).mockResolvedValueOnce(fakeTask([]));
    const segmenter = await createPersonSegmenter();
    expect(createFromOptions.mock.calls.map(([, o]) => o.baseOptions.delegate)).toEqual(['GPU', 'CPU']);
    expect(segmenter.delegate).toBe('CPU');
  });

  it('rejects when neither delegate starts', async () => {
    isSimdSupported.mockResolvedValue(true);
    createFromOptions.mockRejectedValue(new Error('model 404'));
    await expect(createPersonSegmenter()).rejects.toThrow('model 404');
  });

  it('hands over the person channel with strictly increasing timestamps', async () => {
    isSimdSupported.mockResolvedValue(true);
    const task = fakeTask([mask([0.9, 0.9]), mask([0.1, 0.8])]);
    createFromOptions.mockResolvedValue(task);
    const segmenter = await createPersonSegmenter();

    const sink = vi.fn();
    const input = {} as HTMLCanvasElement;
    segmenter.segment(input, 100.4, sink);
    segmenter.segment(input, 100.9, sink);
    segmenter.segment(input, 50, sink);

    expect(task.segmentForVideo.mock.calls.map(([, ts]) => ts)).toEqual([100, 101, 102]);
    const [confidence, width, height] = sink.mock.calls[0];
    expect([...confidence].map((v: number) => Math.round(v * 10) / 10)).toEqual([0.1, 0.8]);
    expect([width, height]).toEqual([2, 1]);
  });
});
