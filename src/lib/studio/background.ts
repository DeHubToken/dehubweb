/**
 * Camera background
 * =================
 * Blurs the room behind the creator, or swaps it for a flat colour or a
 * picture — what OBS does with a plugin and Zoom does built in — on the
 * creator's own device, before the camera track is ever sent. Same contract as
 * the camera looks in lib/livepeer/video-effects: draw the camera into a
 * canvas and hand back the canvas's own MediaStreamTrack, because WebRTC
 * publishes a track and anything that changes the picture has to happen before
 * the track exists.
 *
 * Unlike the looks, this one needs to know where the person is, and that takes
 * a model: MediaPipe's selfie segmenter, ~250 KB of weights on an ~11 MB WASM
 * runtime. That is why it lives in its own module behind a dynamic import (see
 * ./segmenter) and loads on the first call to `startBackgroundStage`, never at
 * boot and never for anyone who leaves the background alone.
 *
 * Per frame:
 *
 *   1. The camera is shrunk to the model's working size (256 on the long side)
 *      and segmented — unless the last few segmentations ran long, in which
 *      case the previous mask is reused. A slow model makes the edge lag a
 *      little; it must never make the broadcast stutter.
 *   2. The mask is sharpened (a smoothstep on the confidence), blended with
 *      the previous one to steady flickering hair, and feathered with a small
 *      blur at mask resolution, where blurring is nearly free.
 *   3. The background (blurred camera, colour or image) is drawn, and the
 *      camera cut out by the mask is laid over it.
 *
 * The source is borrowed, never owned: `stop()` retires the canvas track and
 * the loop and leaves the camera running. Whoever captured it stops it.
 */

import { createLogger } from '@/lib/logger';
import type { PersonSegmenter } from './segmenter';

const logger = createLogger('CameraBackground');

export type BackgroundMode = 'none' | 'blur' | 'color' | 'image';

export interface BackgroundOptions {
  /** Any CSS colour. Used by 'color', and by 'image' until the image is ready. */
  color?: string;
  /** Anything canvas can draw. `null` clears a previously set image. */
  image?: CanvasImageSource | null;
  /** Blur strength at output resolution, for 'blur'. */
  blurPx?: number;
}

export interface BackgroundStage {
  /** The processed camera track to publish/compose instead of the source. */
  track: MediaStreamTrack;
  setMode(mode: BackgroundMode, opts?: BackgroundOptions): void;
  /** Retires the output track + loop; leaves the source running (borrowed, never owned). */
  stop(): void;
}

export const BACKGROUND_MODES: readonly BackgroundMode[] = ['none', 'blur', 'color', 'image'];

export const DEFAULT_BACKGROUND_COLOR = '#111318';
export const DEFAULT_BLUR_PX = 16;
export const MIN_BLUR_PX = 2;
export const MAX_BLUR_PX = 48;

/** Same ceiling as the camera looks; capture is 720p, so this rarely bites. */
const MAX_SIDE = 1280;
const DEFAULT_FRAME_RATE = 30;
const MAX_FRAME_RATE = 60;
/** Long side of the frame handed to the model, which works at 256x256. */
const SEGMENT_SIDE = 256;
/** Mask-resolution feather. One pixel here is ~5 at 720p output. */
const FEATHER_PX = 1;
/** Spare border around the mask so the feather has real data to read at the frame edge. */
const MASK_PAD = 3;
/** Consecutive segmentation failures before the stage gives up and passes the camera through. */
const MAX_SEGMENT_FAILURES = 3;

// ---------------------------------------------------------------------------
// Pure parts — exported for the tests
// ---------------------------------------------------------------------------

export interface ResolvedBackground {
  mode: BackgroundMode;
  color: string;
  image: CanvasImageSource | null;
  blurPx: number;
}

/**
 * Folds a `setMode` call into the current settings.
 *
 * Options carry over between calls on purpose: a creator who picked a colour,
 * tried blur and came back expects their colour, not the default. `image:
 * null` is the one explicit clear. Anything malformed (a mode from an old
 * saved preference, NaN from a slider) falls back rather than throws, because
 * this runs while live.
 */
export function resolveBackground(
  mode: BackgroundMode,
  opts: BackgroundOptions = {},
  previous?: ResolvedBackground
): ResolvedBackground {
  const color =
    typeof opts.color === 'string' && opts.color.trim() !== ''
      ? opts.color.trim()
      : previous?.color ?? DEFAULT_BACKGROUND_COLOR;
  const blurPx =
    typeof opts.blurPx === 'number' && Number.isFinite(opts.blurPx)
      ? Math.min(MAX_BLUR_PX, Math.max(MIN_BLUR_PX, opts.blurPx))
      : previous?.blurPx ?? DEFAULT_BLUR_PX;
  const image = 'image' in opts ? opts.image ?? null : previous?.image ?? null;
  return {
    mode: BACKGROUND_MODES.includes(mode) ? mode : 'none',
    color,
    image,
    blurPx,
  };
}

/**
 * Intrinsic size of anything `drawImage` accepts, or 0x0 if it has nothing to
 * draw yet — an <img> still loading, a <video> before its first frame.
 */
export function imageSourceSize(source: CanvasImageSource | null | undefined): { width: number; height: number } {
  if (!source) return { width: 0, height: 0 };
  const s = source as unknown as Record<string, unknown>;
  if (typeof s.naturalWidth === 'number') {
    // An <img> reports naturalWidth 0 until decoded, and `complete` with 0 on
    // a broken URL — both mean "nothing to draw".
    return { width: s.naturalWidth as number, height: (s.naturalHeight as number) || 0 };
  }
  if (typeof s.videoWidth === 'number') {
    return { width: s.videoWidth as number, height: (s.videoHeight as number) || 0 };
  }
  if (typeof s.displayWidth === 'number') {
    // VideoFrame
    return { width: s.displayWidth as number, height: (s.displayHeight as number) || 0 };
  }
  const width = s.width as { baseVal?: { value: number } } | number | undefined;
  const height = s.height as { baseVal?: { value: number } } | number | undefined;
  if (typeof width === 'number') return { width, height: typeof height === 'number' ? height : 0 };
  // SVGImageElement keeps its size in animated lengths.
  if (width && typeof width === 'object' && width.baseVal) {
    return {
      width: width.baseVal.value,
      height: height && typeof height === 'object' && height.baseVal ? height.baseVal.value : 0,
    };
  }
  return { width: 0, height: 0 };
}

/**
 * The mode that will actually be drawn. 'image' without a drawable image
 * shows the colour instead of the raw room — the creator asked for their room
 * to be hidden, and a picture that is still loading is no reason to show it.
 */
export function effectiveMode(bg: ResolvedBackground): BackgroundMode {
  if (bg.mode !== 'image') return bg.mode;
  const { width, height } = imageSourceSize(bg.image);
  return width > 0 && height > 0 ? 'image' : 'color';
}

/** Output dimensions: source size, long side capped, both even for H.264. */
export function outputSize(sourceWidth: number, sourceHeight: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const w = sourceWidth > 0 ? sourceWidth : 1280;
  const h = sourceHeight > 0 ? sourceHeight : 720;
  const scale = Math.min(maxSide / Math.max(w, h), 1);
  return {
    width: Math.max(2, Math.round((w * scale) / 2) * 2),
    height: Math.max(2, Math.round((h * scale) / 2) * 2),
  };
}

/** The rectangle that covers `dst` with `src`'s aspect ratio, centred and cropped. */
export function coverRect(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: (dstWidth - width) / 2, y: (dstHeight - height) / 2, width, height };
}

/**
 * Model confidence -> mask alpha. The raw sigmoid is soft and wide around the
 * person, which reads as a glowing halo once the background is replaced; a
 * smoothstep over the middle of the range tightens the edge while keeping it
 * anti-aliased. The feather added later supplies the softness back, evenly.
 */
export const MASK_LOW = 0.3;
export const MASK_HIGH = 0.75;
export function confidenceToAlpha(confidence: number): number {
  const t = Math.min(1, Math.max(0, (confidence - MASK_LOW) / (MASK_HIGH - MASK_LOW)));
  return t * t * (3 - 2 * t);
}

/**
 * How far each new mask moves the kept one. The model scores every frame
 * independently, so fine hair flips in and out frame to frame; a running blend
 * steadies it. Much lower and a quick head turn leaves a ghost behind.
 */
export const MASK_RESPONSE = 0.65;

/**
 * Writes one frame's confidence into the alpha channel of `rgba` (the mask
 * ImageData's buffer), blended with what is already there unless `fresh`.
 * Colour channels are left alone — the mask is only ever used for its alpha.
 */
export function blendMask(confidence: Float32Array, rgba: Uint8ClampedArray, fresh: boolean, response = MASK_RESPONSE) {
  const n = Math.min(confidence.length, rgba.length >> 2);
  for (let i = 0; i < n; i++) {
    const next = confidenceToAlpha(confidence[i]) * 255;
    const j = i * 4 + 3;
    rgba[j] = fresh ? next : rgba[j] + (next - rgba[j]) * response;
  }
}

/**
 * Segmentation pacing.
 *
 * The model runs on the main thread, synchronously, inside the draw. When it
 * fits comfortably in a frame it runs every frame; when it does not (a weak
 * laptop on the CPU path, a GPU busy with a game) it is spaced out so it never
 * takes more than SEGMENT_DUTY of the time, and the frames in between reuse
 * the last mask. The picture keeps its frame rate; only the edge updates
 * less often. MAX_SEGMENT_GAP_MS stops a very slow device from freezing the
 * cut-out altogether.
 */
export const SEGMENT_DUTY = 0.5;
export const MAX_SEGMENT_GAP_MS = 500;
/**
 * The first runs include shader compilation and WASM warm-up and can take ten
 * times a normal frame. Counting them would throttle the first seconds of
 * every broadcast for no reason.
 */
export const SEGMENT_WARMUP_RUNS = 3;
const COST_SMOOTHING = 0.25;

export interface SegmentPacing {
  /** Smoothed cost of one segmentation, ms. 0 until warmed up. */
  avgCostMs: number;
  /** When the last segmentation ran, ms on the performance clock. */
  lastRunAt: number;
  runs: number;
}

export function initialPacing(): SegmentPacing {
  return { avgCostMs: 0, lastRunAt: Number.NEGATIVE_INFINITY, runs: 0 };
}

export function shouldSegment(pacing: SegmentPacing, now: number, frameIntervalMs: number, hasMask: boolean): boolean {
  if (!hasMask) return true;
  if (pacing.avgCostMs <= frameIntervalMs * SEGMENT_DUTY) return true;
  const gap = Math.min(MAX_SEGMENT_GAP_MS, pacing.avgCostMs / SEGMENT_DUTY);
  return now - pacing.lastRunAt >= gap;
}

export function recordSegmentCost(pacing: SegmentPacing, now: number, costMs: number): SegmentPacing {
  const runs = pacing.runs + 1;
  if (runs <= SEGMENT_WARMUP_RUNS) return { avgCostMs: 0, lastRunAt: now, runs };
  const avgCostMs =
    pacing.avgCostMs === 0 ? costMs : pacing.avgCostMs + (costMs - pacing.avgCostMs) * COST_SMOOTHING;
  return { avgCostMs, lastRunAt: now, runs };
}

/**
 * How frames are driven. requestVideoFrameCallback fires once per decoded
 * camera frame, so the model never runs twice on the same picture, and Chrome
 * keeps it going in a background tab. Without it (Firefox) a timer at the
 * camera's rate: rAF would be the smoother choice in the foreground, but it
 * stops dead in a background tab, and a creator who switches to OBS or a game
 * mid-stream would publish a frozen frame. Timers only slow down there.
 */
export type FramePump = 'rvfc' | 'timer';
export function pickFramePump(video: object): FramePump {
  return typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'
    ? 'rvfc'
    : 'timer';
}

// ---------------------------------------------------------------------------
// Support and loading
// ---------------------------------------------------------------------------

/**
 * Whether this browser can run the stage at all: WebAssembly for the model,
 * and canvas capture for the output track. WebGL is not required — the
 * segmenter falls back to its CPU path — and `ctx.filter` is not either;
 * the blurs have a drawImage-only fallback. Cheap and side-effect free, so a
 * picker can call it on render to decide whether to show the option.
 */
export function backgroundRemovalSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') return false;
  if (typeof MediaStream === 'undefined') return false;
  if (typeof HTMLCanvasElement === 'undefined') return false;
  return typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * `ctx.filter` arrived in Safari only in 18. Probed once, the same way the
 * camera looks probe it.
 */
let filterSupport: boolean | null = null;
function canvasFiltersSupported(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return (filterSupport = false);
    probe.filter = 'blur(1px)';
    filterSupport = probe.filter !== 'none' && probe.filter !== '';
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

/**
 * One segmenter for the session. Loading it compiles ~11 MB of WASM and
 * builds the GPU pipeline, which is seconds on a phone; toggling the
 * background off and on again, or flipping cameras, should not pay that
 * twice. A failed load is forgotten so the next attempt can retry.
 */
let segmenterPromise: Promise<PersonSegmenter> | null = null;
function loadSegmenter(): Promise<PersonSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = import('./segmenter')
      .then((m) => m.createPersonSegmenter())
      .catch((error) => {
        segmenterPromise = null;
        throw error;
      });
  }
  return segmenterPromise;
}

/**
 * A hidden <video> is the only way to get a MediaStreamTrack into a canvas —
 * drawImage takes an element, not a track. Muted because the audio path is
 * handled elsewhere and a second audible copy here would echo.
 */
async function playTrack(track: MediaStreamTrack): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    // A track that never fires metadata must not hang go-live: draw a blank
    // frame instead of waiting forever.
    setTimeout(resolve, 3000);
  });

  try {
    await video.play();
  } catch (error) {
    logger.warn('Background source failed to play', error);
  }
  return video;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement, alpha = true): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('Canvas 2D is unavailable, so the camera background cannot run.');
  return ctx;
}

function resize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

/** Loads the segmenter lazily on first call. Rejects if unsupported or model fails to load. */
export async function startBackgroundStage(
  source: MediaStreamTrack,
  mode: BackgroundMode,
  opts?: BackgroundOptions
): Promise<BackgroundStage> {
  if (!backgroundRemovalSupported()) {
    throw new Error('Background effects are not supported in this browser.');
  }

  // The model and the camera warm up in parallel; either can take a second.
  const [segmenter, video] = await Promise.all([loadSegmenter(), playTrack(source)]);

  let settings = resolveBackground(mode, opts);
  let stopped = false;

  const trackSettings = source.getSettings?.() ?? {};
  const { width, height } = outputSize(
    trackSettings.width || video.videoWidth,
    trackSettings.height || video.videoHeight
  );
  const frameRate = Math.min(MAX_FRAME_RATE, Math.round(trackSettings.frameRate || DEFAULT_FRAME_RATE));
  const frameIntervalMs = 1000 / frameRate;
  const filters = canvasFiltersSupported();

  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas, false);

  // The camera cut out by the mask, composited over the background each frame.
  const person = makeCanvas(width, height);
  const personCtx = context2d(person);

  // Model input, at the model's working size and the camera's aspect ratio.
  const segScale = SEGMENT_SIDE / Math.max(width, height);
  const segInput = makeCanvas(Math.max(2, Math.round(width * segScale)), Math.max(2, Math.round(height * segScale)));
  const segInputCtx = context2d(segInput, false);

  /*
   * The mask, in three small canvases. `mask` holds the blended confidence as
   * alpha. `maskPad` is the same with a few pixels of border filled by a
   * stretched copy, so the feather blur reads plausible values at the frame
   * edge instead of transparent black — without it a creator's shoulders fade
   * out along the bottom of the picture. `maskSoft` is the feathered result.
   */
  const mask = makeCanvas(segInput.width, segInput.height);
  const maskCtx = context2d(mask);
  const maskPad = makeCanvas(mask.width + MASK_PAD * 2, mask.height + MASK_PAD * 2);
  const maskPadCtx = context2d(maskPad);
  const maskSoft = makeCanvas(maskPad.width, maskPad.height);
  const maskSoftCtx = context2d(maskSoft);
  let maskImage: ImageData | null = null;
  let hasMask = false;

  // Background blur buffers: one small pair with filters, a halving chain without.
  const blurSmall = makeCanvas(2, 2);
  const blurSmallCtx = context2d(blurSmall, false);
  const blurOut = makeCanvas(2, 2);
  const blurOutCtx = context2d(blurOut, false);
  const halvings: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];

  let pacing = initialPacing();
  let failures = 0;
  let broken = false;

  const writeMask = (confidence: Float32Array, maskWidth: number, maskHeight: number) => {
    let fresh = !hasMask;
    if (!maskImage || maskImage.width !== maskWidth || maskImage.height !== maskHeight) {
      maskImage = new ImageData(maskWidth, maskHeight);
      // White, so a debug draw of the mask shows the person; only alpha is used.
      maskImage.data.fill(255);
      resize(mask, maskWidth, maskHeight);
      resize(maskPad, maskWidth + MASK_PAD * 2, maskHeight + MASK_PAD * 2);
      resize(maskSoft, maskPad.width, maskPad.height);
      fresh = true;
    }
    blendMask(confidence, maskImage.data, fresh);
    maskCtx.putImageData(maskImage, 0, 0);

    maskPadCtx.clearRect(0, 0, maskPad.width, maskPad.height);
    maskPadCtx.drawImage(mask, 0, 0, maskPad.width, maskPad.height);
    maskPadCtx.clearRect(MASK_PAD, MASK_PAD, maskWidth, maskHeight);
    maskPadCtx.drawImage(mask, MASK_PAD, MASK_PAD);

    if (filters) {
      maskSoftCtx.clearRect(0, 0, maskSoft.width, maskSoft.height);
      maskSoftCtx.filter = `blur(${FEATHER_PX}px)`;
      maskSoftCtx.drawImage(maskPad, 0, 0);
      maskSoftCtx.filter = 'none';
    }
    hasMask = true;
  };

  const segment = (now: number) => {
    segInputCtx.drawImage(video, 0, 0, segInput.width, segInput.height);
    const started = performance.now();
    try {
      segmenter.segment(segInput, now, writeMask);
      failures = 0;
    } catch (error) {
      failures++;
      if (failures >= MAX_SEGMENT_FAILURES) {
        // Better the plain camera than a broadcast stuck on one cut-out.
        broken = true;
        logger.error('Background segmentation keeps failing; passing the camera through', error);
      }
      return;
    }
    pacing = recordSegmentCost(pacing, now, performance.now() - started);
  };

  /*
   * Blur with `ctx.filter`: shrink the camera to a quarter, blur that, scale
   * back up. The blur runs over a thumbnail rather than 720p, which keeps a
   * heavy blur as cheap as a light one, and the upscale smooths what is left.
   */
  const blurWithFilter = (blurPx: number): HTMLCanvasElement => {
    const divisor = 4;
    const w = Math.max(2, Math.round(width / divisor));
    const h = Math.max(2, Math.round(height / divisor));
    resize(blurSmall, w, h);
    resize(blurOut, w, h);
    blurSmallCtx.drawImage(video, 0, 0, w, h);
    const radius = blurPx / divisor;
    // A canvas blur samples outside the canvas as transparent black, so the
    // edges would darken; drawing a little oversized pushes that off-canvas.
    const overscale = 1 + (4 * radius) / Math.min(w, h);
    const ow = w * overscale;
    const oh = h * overscale;
    blurOutCtx.filter = `blur(${radius}px)`;
    blurOutCtx.drawImage(blurSmall, (w - ow) / 2, (h - oh) / 2, ow, oh);
    blurOutCtx.filter = 'none';
    return blurOut;
  };

  /*
   * Without `ctx.filter` (Safari before 18): halve the frame repeatedly until
   * it is small enough, then let the upscale smear it. Each halving is a
   * bilinear 2x2 average, so the chain approximates a box blur — coarser than
   * a gaussian, but on a background nobody is meant to look at, close enough.
   */
  const blurByHalving = (blurPx: number): { canvas: HTMLCanvasElement; width: number; height: number } | null => {
    const target = Math.max(2, width / Math.max(2, blurPx * 0.75));
    let src: CanvasImageSource = video;
    let last: HTMLCanvasElement | null = null;
    let w = width;
    let h = height;
    let step = 0;
    while (w / 2 >= target && w > 4 && h > 4) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      if (!halvings[step]) {
        const c = makeCanvas(w, h);
        halvings[step] = { canvas: c, ctx: context2d(c, false) };
      }
      const { canvas: c, ctx: cctx } = halvings[step];
      resize(c, w, h);
      cctx.drawImage(src, 0, 0, w, h);
      src = last = c;
      step++;
    }
    return last ? { canvas: last, width: w, height: h } : null;
  };

  const drawBackground = (active: BackgroundMode) => {
    switch (active) {
      case 'blur': {
        ctx.imageSmoothingEnabled = true;
        if (filters) {
          ctx.drawImage(blurWithFilter(settings.blurPx), 0, 0, width, height);
        } else {
          const result = blurByHalving(settings.blurPx);
          if (result) {
            ctx.drawImage(result.canvas, 0, 0, result.width, result.height, 0, 0, width, height);
          } else {
            ctx.drawImage(video, 0, 0, width, height);
          }
        }
        break;
      }
      case 'image': {
        const image = settings.image!;
        const size = imageSourceSize(image);
        const rect = coverRect(size.width, size.height, width, height);
        ctx.fillStyle = settings.color;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        break;
      }
      case 'color':
      default:
        ctx.fillStyle = settings.color;
        ctx.fillRect(0, 0, width, height);
        break;
    }
  };

  const drawPerson = () => {
    personCtx.globalCompositeOperation = 'source-over';
    personCtx.clearRect(0, 0, width, height);
    personCtx.drawImage(video, 0, 0, width, height);
    personCtx.globalCompositeOperation = 'destination-in';
    personCtx.imageSmoothingEnabled = true;
    const feathered = filters ? maskSoft : maskPad;
    personCtx.drawImage(feathered, MASK_PAD, MASK_PAD, mask.width, mask.height, 0, 0, width, height);
    personCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(person, 0, 0);
  };

  let lastDrawAt = 0;
  const drawFrame = () => {
    if (stopped) return;
    const now = performance.now();
    lastDrawAt = now;

    if (video.readyState < 2 || video.videoWidth === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const active = effectiveMode(settings);
    if (active === 'none' || broken) {
      ctx.drawImage(video, 0, 0, width, height);
      return;
    }

    if (shouldSegment(pacing, now, frameIntervalMs, hasMask)) segment(now);

    // Until the first mask lands the camera shows as-is for a frame or two,
    // which beats a flash of empty background.
    if (!hasMask || broken) {
      ctx.drawImage(video, 0, 0, width, height);
      return;
    }

    drawBackground(active);
    drawPerson();
  };

  type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  const pumpVideo = video as FrameCallbackVideo;
  const pump = pickFramePump(pumpVideo);
  let frameHandle = 0;
  let timerHandle = 0;

  if (pump === 'rvfc') {
    const onFrame = () => {
      if (stopped) return;
      drawFrame();
      frameHandle = pumpVideo.requestVideoFrameCallback!(onFrame);
    };
    frameHandle = pumpVideo.requestVideoFrameCallback!(onFrame);
  } else {
    const onTick = () => {
      if (stopped) return;
      const started = performance.now();
      drawFrame();
      timerHandle = window.setTimeout(onTick, Math.max(0, frameIntervalMs - (performance.now() - started)));
    };
    timerHandle = window.setTimeout(onTick, 0);
  }

  // A floor under the pump, as in the camera looks: if frame callbacks stop
  // (a paused source, a throttled tab) the output keeps moving, slowly,
  // rather than freezing. Skips itself while the pump is healthy.
  const watchdog = window.setInterval(() => {
    if (performance.now() - lastDrawAt > 200) drawFrame();
  }, 250);

  drawFrame();
  const stream = canvas.captureStream(frameRate);
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stopped = true;
    window.clearInterval(watchdog);
    window.clearTimeout(timerHandle);
    video.srcObject = null;
    throw new Error('The background canvas produced no video track.');
  }

  logger.info('Camera background started', {
    mode: settings.mode,
    width,
    height,
    frameRate,
    delegate: segmenter.delegate,
    pump,
    filters,
  });

  return {
    track,
    setMode: (next, nextOpts) => {
      if (stopped) return;
      const before = effectiveMode(settings);
      settings = resolveBackground(next, nextOpts, settings);
      // A mask kept from before 'none' shows wherever the creator stood then.
      if (before === 'none' && effectiveMode(settings) !== 'none') hasMask = false;
      drawFrame();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(watchdog);
      window.clearTimeout(timerHandle);
      if (frameHandle && typeof pumpVideo.cancelVideoFrameCallback === 'function') {
        pumpVideo.cancelVideoFrameCallback(frameHandle);
      }
      track.stop();
      // Detaching is what lets the element be collected; the track inside
      // belongs to the caller and keeps running. The segmenter stays loaded
      // for the next stage (see loadSegmenter).
      video.srcObject = null;
    },
  };
}
