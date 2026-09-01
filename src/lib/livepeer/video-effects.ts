/**
 * Camera looks
 * ============
 * Draws the webcam through a filter into a canvas and hands back that canvas's
 * own MediaStreamTrack, which the WHIP session publishes in place of the bare
 * camera. Same shape as the camera-bubble compositor next door, and for the
 * same reason: WebRTC publishes a track, so anything that changes the picture
 * has to happen before the track exists.
 *
 * Everything here is canvas 2D — no model download, no WASM, no network. That
 * is a deliberate ceiling, not an oversight: a look that had to fetch weights
 * would land on the boot path of the one screen where a stall costs a
 * broadcast, and segmentation-grade effects (background replace, face-only
 * blur) are the reason a later tier will need them. The privacy looks here
 * cover the whole frame precisely because nothing in this file knows where a
 * face is.
 *
 * The source is borrowed, never owned: `stop()` retires the canvas track and
 * the draw loop and leaves the camera running, because the broadcaster still
 * needs it the moment the look is switched off. Whoever captured it stops it.
 */

import { createLogger } from '@/lib/logger';
import type { VideoEffectId } from '@/constants/video-effects.constants';

const logger = createLogger('VideoEffects');

/** Camera capture is 720p (see cameraConstraints); this is a ceiling, not a target. */
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 1280;
const FRAME_RATE = 30;

/**
 * Whether this engine can do the filtered looks at all.
 *
 * `ctx.filter` is the whole colour-grade path and Safari only shipped it in
 * 18. Rather than render a grid of buttons that quietly do nothing on an older
 * iPhone, the selector asks first and drops the looks that need it — pixelate
 * and blur are pure drawImage and survive either way.
 */
let filterSupport: boolean | null = null;
export function canvasFiltersSupported(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) return (filterSupport = false);
    probe.filter = 'grayscale(1)';
    filterSupport = probe.filter !== 'none' && probe.filter !== '';
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

export interface VideoEffectStage {
  /** The filtered track to publish. */
  track: MediaStreamTrack;
  /** Changes the look without touching the published track. */
  setEffect: (id: VideoEffectId) => void;
  /** Points the canvas at a different camera — a flip, or a return from a share. */
  setSource: (track: MediaStreamTrack) => Promise<void>;
  /** Retires the canvas track and the draw loop. The source is left running. */
  stop: () => void;
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
    // A track that never fires metadata must not hang the look: draw a blank
    // frame instead of waiting forever.
    setTimeout(resolve, 3000);
  });

  try {
    await video.play();
  } catch (error) {
    logger.warn('Look source failed to play', error);
  }
  return video;
}

/**
 * Draws the source over the whole canvas, optionally oversized.
 *
 * The overscale exists for the blurred looks. A canvas blur samples outside
 * the drawn rect as transparent black, so a blur drawn edge-to-edge fades to
 * a dark border. Drawing a few percent larger pushes that fade off-canvas.
 */
function drawCovered(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  overscale = 1
) {
  if (overscale === 1) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  const w = width * overscale;
  const h = height * overscale;
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
}

/** Four-pixel horizontal banding, built once and tiled — cheaper than a fillRect per line. */
function buildScanlines(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = 1;
  tile.height = 4;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  tileCtx.fillStyle = 'rgba(0,0,0,0.5)';
  tileCtx.fillRect(0, 0, 1, 2);
  return ctx.createPattern(tile, 'repeat');
}

/** Pure `ctx.filter` looks — the whole recipe is one string. */
const FILTER_RECIPES: Partial<Record<VideoEffectId, string>> = {
  mono: 'grayscale(1) contrast(1.08)',
  noir: 'grayscale(1) contrast(1.5) brightness(0.9)',
  warm: 'sepia(0.4) saturate(1.45) contrast(1.05)',
  vivid: 'saturate(1.75) contrast(1.18) brightness(1.02)',
  neon: 'saturate(2.4) hue-rotate(200deg) contrast(1.25)',
};

export async function startVideoEffect(opts: {
  source: MediaStreamTrack;
  effect: VideoEffectId;
}): Promise<VideoEffectStage> {
  let video = await playTrack(opts.source);
  let activeEffect = opts.effect;
  let stopped = false;

  const settings = opts.source.getSettings?.() ?? {};
  const sourceWidth = settings.width || video.videoWidth || 1280;
  const sourceHeight = settings.height || video.videoHeight || 720;
  const scale = Math.min(MAX_WIDTH / sourceWidth, MAX_HEIGHT / sourceHeight, 1);

  const canvas = document.createElement('canvas');
  // Even dimensions: H.264 chroma subsampling needs them, and an odd width
  // makes some encoders silently pad or refuse the frame.
  canvas.width = Math.round((sourceWidth * scale) / 2) * 2;
  canvas.height = Math.round((sourceHeight * scale) / 2) * 2;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable, so camera looks cannot run.');

  /**
   * One reusable low-resolution buffer for every look that downsamples.
   *
   * Blur and pixelate both work by throwing pixels away and scaling back up,
   * which is why a heavy blur costs about the same as a light one here — the
   * expensive `blur()` runs over a thumbnail, not over 720p. Allocating a
   * canvas per frame instead would churn the GC at 30Hz.
   */
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d', { alpha: false });
  const scanlines = buildScanlines(ctx);

  /** Renders `source` into the scratch buffer at `divisor` of canvas size. */
  const downsample = (divisor: number): HTMLCanvasElement | null => {
    if (!scratchCtx) return null;
    const w = Math.max(2, Math.round(canvas.width / divisor));
    const h = Math.max(2, Math.round(canvas.height / divisor));
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    scratchCtx.drawImage(video, 0, 0, w, h);
    return scratch;
  };

  const reset = () => {
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
  };

  const drawFrame = () => {
    if (stopped) return;
    const { width, height } = canvas;

    if (video.readyState < 2 || video.videoWidth === 0) {
      reset();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    reset();

    const recipe = FILTER_RECIPES[activeEffect];
    if (recipe) {
      ctx.filter = recipe;
      ctx.drawImage(video, 0, 0, width, height);
      reset();
      if (activeEffect === 'noir') {
        // A vignette is what separates "black and white" from "noir"; without
        // it the high contrast just reads as a broken camera.
        const vignette = ctx.createRadialGradient(
          width / 2, height / 2, Math.min(width, height) * 0.3,
          width / 2, height / 2, Math.max(width, height) * 0.72
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        reset();
      }
      return;
    }

    switch (activeEffect) {
      /*
       * Soft: the flattering one, and the only look most creators will ever
       * use. A quarter-res copy laid back over the sharp frame lifts the
       * midtones and swallows texture without the picture going out of focus —
       * the sharp edges are still underneath.
       */
      case 'soft': {
        ctx.filter = 'brightness(1.06) saturate(1.06) contrast(0.97)';
        ctx.drawImage(video, 0, 0, width, height);
        reset();
        const small = downsample(4);
        if (small) {
          ctx.filter = 'blur(3px)';
          ctx.globalCompositeOperation = 'lighten';
          ctx.globalAlpha = 0.4;
          drawCovered(ctx, small, width, height, 1.06);
          reset();
        }
        break;
      }

      /* Dream: the same trick pushed until it blooms. */
      case 'dream': {
        ctx.drawImage(video, 0, 0, width, height);
        const small = downsample(4);
        if (small) {
          ctx.filter = 'blur(5px) saturate(1.5)';
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.34;
          drawCovered(ctx, small, width, height, 1.08);
          reset();
        }
        break;
      }

      /*
       * Cool: `ctx.filter` has no colour-temperature term, so the grade is a
       * soft-light wash over a normally-drawn frame. hue-rotate would swing
       * the whole wheel and turn skin green.
       */
      case 'cool': {
        ctx.filter = 'saturate(1.12) contrast(1.06)';
        ctx.drawImage(video, 0, 0, width, height);
        reset();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#2f6dff';
        ctx.fillRect(0, 0, width, height);
        reset();
        break;
      }

      /*
       * VHS: two saturated ghosts screened either side of the frame stand in
       * for chromatic aberration. Isolating real R and B channels would need
       * a full-size offscreen buffer per channel, which is three extra 720p
       * composites a frame for a difference nobody can see on a stream.
       */
      case 'vhs': {
        const drift = Math.max(2, Math.round(width * 0.004));
        ctx.drawImage(video, 0, 0, width, height);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.3;
        ctx.filter = 'saturate(2.6) hue-rotate(-14deg)';
        ctx.drawImage(video, -drift, 0, width, height);
        ctx.filter = 'saturate(2.6) hue-rotate(14deg)';
        ctx.drawImage(video, drift, 0, width, height);
        reset();
        if (scanlines) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = scanlines;
          ctx.fillRect(0, 0, width, height);
          reset();
        }
        break;
      }

      /*
       * Blur: an anonymity control, not a bokeh. Eight-to-one downsampling
       * destroys the detail outright — a CSS-grade blur can be undone by
       * anyone who cares, and this cannot, because the pixels are gone before
       * the blur runs.
       */
      case 'blur': {
        const small = downsample(8);
        ctx.filter = 'blur(6px)';
        drawCovered(ctx, small ?? video, width, height, 1.12);
        reset();
        break;
      }

      /* Pixelate: the same idea with the smoothing off, so it reads as a choice. */
      case 'pixelate': {
        const small = downsample(28);
        if (small) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(small, 0, 0, width, height);
          reset();
        }
        break;
      }

      case 'none':
      default:
        ctx.drawImage(video, 0, 0, width, height);
        break;
    }
  };

  /**
   * Frame pump, lifted from the bubble compositor for the same reasons:
   * requestVideoFrameCallback fires per decoded camera frame and keeps its
   * rate in a background tab, rAF is the Firefox fallback, and the interval is
   * a floor under both so a throttled tab publishes a slow picture rather than
   * a frozen one.
   */
  type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  let rafHandle = 0;
  let frameHandle = 0;
  let pump = video as FrameCallbackVideo;

  const startPump = () => {
    if (typeof pump.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        if (stopped) return;
        drawFrame();
        frameHandle = pump.requestVideoFrameCallback!(onFrame);
      };
      frameHandle = pump.requestVideoFrameCallback(onFrame);
    } else {
      const onRaf = () => {
        if (stopped) return;
        drawFrame();
        rafHandle = requestAnimationFrame(onRaf);
      };
      rafHandle = requestAnimationFrame(onRaf);
    }
  };

  const stopPump = () => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (frameHandle && typeof pump.cancelVideoFrameCallback === 'function') {
      pump.cancelVideoFrameCallback(frameHandle);
    }
    rafHandle = 0;
    frameHandle = 0;
  };

  startPump();
  const watchdog = window.setInterval(drawFrame, 250);

  drawFrame();
  const stream = canvas.captureStream(FRAME_RATE);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('The look canvas produced no video track.');

  logger.info('Camera look started', {
    effect: activeEffect,
    width: canvas.width,
    height: canvas.height,
    pump: typeof pump.requestVideoFrameCallback === 'function' ? 'rvfc' : 'raf',
  });

  return {
    track,
    setEffect: (next: VideoEffectId) => {
      activeEffect = next;
      drawFrame();
    },
    setSource: async (nextTrack: MediaStreamTrack) => {
      if (stopped) return;
      // The pump is bound to the OLD element, so it has to be torn down before
      // the swap — left running it would keep drawing a detached video and the
      // new camera would never appear.
      stopPump();
      const previous = video;
      // Held aside rather than assigned straight to `video`: stop() may run
      // during the await, and it detaches whatever `video` points at. Assigning
      // first would hand it the new element and leak the old one still attached.
      const next = await playTrack(nextTrack);
      if (stopped) {
        next.srcObject = null;
        return;
      }
      video = next;
      pump = next as FrameCallbackVideo;
      previous.srcObject = null;
      startPump();
      drawFrame();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(watchdog);
      stopPump();
      track.stop();
      // Detaching is what lets the element be collected; the track inside
      // belongs to the caller and keeps running.
      video.srcObject = null;
    },
  };
}
