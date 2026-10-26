import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Nothing here may reach the real runtime: the stage must load it lazily, and
// the pure helpers must not need it at all.
const createPersonSegmenter = vi.fn();
vi.mock('./segmenter', () => ({ createPersonSegmenter }));

import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BLUR_PX,
  MAX_BLUR_PX,
  MAX_SEGMENT_GAP_MS,
  MIN_BLUR_PX,
  SEGMENT_WARMUP_RUNS,
  backgroundRemovalSupported,
  blendMask,
  confidenceToAlpha,
  coverRect,
  effectiveMode,
  imageSourceSize,
  initialPacing,
  outputSize,
  pickFramePump,
  recordSegmentCost,
  resolveBackground,
  shouldSegment,
  startBackgroundStage,
  type BackgroundMode,
  type SegmentPacing,
} from './background';

const img = (naturalWidth: number, naturalHeight: number) =>
  ({ naturalWidth, naturalHeight }) as unknown as HTMLImageElement;

describe('resolveBackground', () => {
  it('fills defaults', () => {
    expect(resolveBackground('blur')).toEqual({
      mode: 'blur',
      color: DEFAULT_BACKGROUND_COLOR,
      image: null,
      blurPx: DEFAULT_BLUR_PX,
    });
  });

  it('carries options over between calls', () => {
    const first = resolveBackground('color', { color: '#ff0066', blurPx: 30 });
    const second = resolveBackground('blur', {}, first);
    expect(second.color).toBe('#ff0066');
    expect(second.blurPx).toBe(30);
    const third = resolveBackground('image', { image: img(10, 10) }, second);
    expect(third.color).toBe('#ff0066');
    expect(resolveBackground('color', {}, third).image).toBe(third.image);
  });

  it('clears the image only on an explicit null', () => {
    const withImage = resolveBackground('image', { image: img(10, 10) });
    expect(resolveBackground('image', { image: null }, withImage).image).toBeNull();
    expect(resolveBackground('image', { image: undefined }, withImage).image).toBeNull();
    expect(resolveBackground('image', { color: 'red' }, withImage).image).toBe(withImage.image);
  });

  it('clamps and rejects malformed values instead of throwing', () => {
    expect(resolveBackground('blur', { blurPx: 0 }).blurPx).toBe(MIN_BLUR_PX);
    expect(resolveBackground('blur', { blurPx: 500 }).blurPx).toBe(MAX_BLUR_PX);
    expect(resolveBackground('blur', { blurPx: Number.NaN }).blurPx).toBe(DEFAULT_BLUR_PX);
    expect(resolveBackground('color', { color: '   ' }).color).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(resolveBackground('sparkles' as BackgroundMode).mode).toBe('none');
  });
});

describe('effectiveMode', () => {
  it('passes plain modes through', () => {
    for (const mode of ['none', 'blur', 'color'] as const) {
      expect(effectiveMode(resolveBackground(mode))).toBe(mode);
    }
  });

  it('shows the colour while an image is missing or still loading', () => {
    expect(effectiveMode(resolveBackground('image'))).toBe('color');
    expect(effectiveMode(resolveBackground('image', { image: img(0, 0) }))).toBe('color');
    expect(effectiveMode(resolveBackground('image', { image: img(1920, 1080) }))).toBe('image');
  });
});

describe('imageSourceSize', () => {
  it('reads each kind of drawable', () => {
    expect(imageSourceSize(img(640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSourceSize({ videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement)).toEqual({ width: 1280, height: 720 });
    expect(imageSourceSize({ displayWidth: 320, displayHeight: 240 } as unknown as VideoFrame)).toEqual({ width: 320, height: 240 });
    expect(imageSourceSize({ width: 100, height: 50 } as unknown as ImageBitmap)).toEqual({ width: 100, height: 50 });
    expect(
      imageSourceSize({ width: { baseVal: { value: 30 } }, height: { baseVal: { value: 20 } } } as unknown as SVGImageElement)
    ).toEqual({ width: 30, height: 20 });
    expect(imageSourceSize(null)).toEqual({ width: 0, height: 0 });
  });
});

describe('geometry', () => {
  it('keeps the source size, capped on the long side and even', () => {
    expect(outputSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(outputSize(641, 481)).toEqual({ width: 642, height: 482 });
    expect(outputSize(0, 0)).toEqual({ width: 1280, height: 720 });
  });

  it('covers the frame without distorting the image', () => {
    const r = coverRect(1000, 1000, 1280, 720);
    expect(r.width).toBe(1280);
    expect(r.height).toBe(1280);
    expect(r.x).toBe(0);
    expect(r.y).toBe(-280);
  });
});

describe('mask shaping', () => {
  it('maps confidence through a clamped smoothstep', () => {
    expect(confidenceToAlpha(0)).toBe(0);
    expect(confidenceToAlpha(0.2)).toBe(0);
    expect(confidenceToAlpha(0.9)).toBe(1);
    expect(confidenceToAlpha(1)).toBe(1);
    const mid = confidenceToAlpha(0.525);
    expect(mid).toBeCloseTo(0.5, 5);
    expect(confidenceToAlpha(0.4)).toBeLessThan(confidenceToAlpha(0.6));
  });

  it('writes alpha only, and blends with the previous mask unless fresh', () => {
    const rgba = new Uint8ClampedArray(8).fill(7);
    blendMask(new Float32Array([1, 0]), rgba, true);
    expect([...rgba]).toEqual([7, 7, 7, 255, 7, 7, 7, 0]);

    blendMask(new Float32Array([0, 1]), rgba, false, 0.5);
    expect(rgba[3]).toBe(128);
    expect(rgba[7]).toBe(128);
    expect(rgba[0]).toBe(7);
  });
});

describe('segmentation pacing', () => {
  const interval = 1000 / 30;
  const warmed = (avgCostMs: number, lastRunAt: number): SegmentPacing => ({
    avgCostMs,
    lastRunAt,
    runs: SEGMENT_WARMUP_RUNS + 10,
  });

  it('always segments when there is no mask yet', () => {
    expect(shouldSegment(warmed(1000, 0), 1, interval, false)).toBe(true);
  });

  it('runs every frame while the model fits the frame budget', () => {
    expect(shouldSegment(warmed(8, 100), 101, interval, true)).toBe(true);
  });

  it('reuses the last mask while a slow model catches up', () => {
    const p = warmed(40, 1000);
    expect(shouldSegment(p, 1000 + interval, interval, true)).toBe(false);
    expect(shouldSegment(p, 1000 + 79, interval, true)).toBe(false);
    expect(shouldSegment(p, 1000 + 80, interval, true)).toBe(true);
  });

  it('never lets the cut-out freeze for long on a very slow device', () => {
    const p = warmed(2000, 0);
    expect(shouldSegment(p, MAX_SEGMENT_GAP_MS - 1, interval, true)).toBe(false);
    expect(shouldSegment(p, MAX_SEGMENT_GAP_MS, interval, true)).toBe(true);
  });

  it('ignores warm-up runs, then smooths the cost', () => {
    let p = initialPacing();
    for (let i = 0; i < SEGMENT_WARMUP_RUNS; i++) p = recordSegmentCost(p, i, 400);
    expect(p.avgCostMs).toBe(0);
    expect(shouldSegment(p, SEGMENT_WARMUP_RUNS, interval, true)).toBe(true);

    p = recordSegmentCost(p, 10, 10);
    expect(p.avgCostMs).toBe(10);
    expect(p.lastRunAt).toBe(10);
    p = recordSegmentCost(p, 20, 50);
    expect(p.avgCostMs).toBe(20);
  });
});

describe('frame pump', () => {
  it('prefers per-frame callbacks and falls back to a timer', () => {
    expect(pickFramePump({ requestVideoFrameCallback: () => 1 })).toBe('rvfc');
    expect(pickFramePump({})).toBe('timer');
  });
});

describe('support detection', () => {
  const proto = HTMLCanvasElement.prototype as unknown as { captureStream?: unknown };
  const original = proto.captureStream;

  afterEach(() => {
    if (original === undefined) delete proto.captureStream;
    else proto.captureStream = original;
    vi.unstubAllGlobals();
  });

  it('needs canvas capture', () => {
    delete proto.captureStream;
    vi.stubGlobal('MediaStream', class {});
    expect(backgroundRemovalSupported()).toBe(false);
    proto.captureStream = () => ({});
    expect(backgroundRemovalSupported()).toBe(true);
  });

  it('needs WebAssembly and MediaStream', () => {
    proto.captureStream = () => ({});
    vi.stubGlobal('MediaStream', class {});
    vi.stubGlobal('WebAssembly', undefined);
    expect(backgroundRemovalSupported()).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal('MediaStream', undefined);
    expect(backgroundRemovalSupported()).toBe(false);
  });

  it('rejects up front, without loading the model, when unsupported', async () => {
    delete proto.captureStream;
    await expect(startBackgroundStage({} as MediaStreamTrack, 'blur')).rejects.toThrow(/not supported/);
    expect(createPersonSegmenter).not.toHaveBeenCalled();
  });
});
