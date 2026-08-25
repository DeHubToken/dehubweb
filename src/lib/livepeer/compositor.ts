/**
 * Camera bubble compositor
 * ========================
 * Draws a screen share and a webcam into one canvas — the game-stream layout —
 * and hands back the canvas's own MediaStreamTrack, which the WHIP session
 * publishes in place of the bare screen track.
 *
 * WebRTC sends one video track per sender, so "screen AND camera" has to be
 * composited client-side; there is no second track to add without a
 * renegotiation and a player that knows what to do with it.
 *
 * The inputs are borrowed, never owned: `stop()` retires the canvas track and
 * the draw loop and leaves the screen and camera tracks running, because the
 * broadcaster still needs the screen track the moment the bubble is switched
 * off. Whoever captured them stops them.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('Compositor');

export type BubbleCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export const BUBBLE_CORNERS: BubbleCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-left',
  'top-right',
];

export interface CameraBubble {
  /** The composited track to publish. */
  track: MediaStreamTrack;
  setCorner: (corner: BubbleCorner) => void;
  /** Retires the canvas track and the draw loop. Inputs are left running. */
  stop: () => void;
}

export interface ComposeOptions {
  /** Fills the frame. */
  screen: MediaStreamTrack;
  /** Drawn as a circle in one corner. */
  camera: MediaStreamTrack;
  corner?: BubbleCorner;
}

/** Ceiling on the composited canvas; a 4K share would cost more CPU than it's worth. */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const FRAME_RATE = 30;

/** Bubble geometry, as fractions of the canvas width. */
const BUBBLE_DIAMETER = 0.22;
const BUBBLE_MARGIN = 0.025;
const MIN_BUBBLE_PX = 96;

/**
 * A hidden <video> is the only way to get a MediaStreamTrack into a canvas —
 * drawImage takes an element, not a track. Kept out of the layout entirely;
 * `muted` matters because the audio path is handled elsewhere and a second
 * audible copy here would echo.
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
    // A track that never fires metadata (a paused capture, a permission race)
    // must not hang go-live: draw a blank frame instead of waiting forever.
    setTimeout(resolve, 3000);
  });

  try {
    await video.play();
  } catch (error) {
    // Autoplay is allowed for muted video; log rather than fail the broadcast.
    logger.warn('Compositor source failed to play', error);
  }
  return video;
}

/** Fits `source` into a square using cover semantics, returning the crop rect. */
function coverCrop(sourceWidth: number, sourceHeight: number) {
  const side = Math.min(sourceWidth, sourceHeight);
  return {
    sx: (sourceWidth - side) / 2,
    sy: (sourceHeight - side) / 2,
    size: side,
  };
}

export async function composeCameraBubble({
  screen,
  camera,
  corner = 'bottom-right',
}: ComposeOptions): Promise<CameraBubble> {
  const [screenVideo, cameraVideo] = await Promise.all([
    playTrack(screen),
    playTrack(camera),
  ]);

  const settings = screen.getSettings?.() ?? {};
  const sourceWidth = settings.width || screenVideo.videoWidth || 1280;
  const sourceHeight = settings.height || screenVideo.videoHeight || 720;
  const scale = Math.min(MAX_WIDTH / sourceWidth, MAX_HEIGHT / sourceHeight, 1);

  const canvas = document.createElement('canvas');
  // Even dimensions: H.264 chroma subsampling needs them, and an odd width
  // makes some encoders silently pad or refuse the frame.
  canvas.width = Math.round((sourceWidth * scale) / 2) * 2;
  canvas.height = Math.round((sourceHeight * scale) / 2) * 2;

  // alpha:false lets the compositor skip blending — measurably cheaper at
  // 1080p30, and nothing here is transparent.
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable, so the camera bubble cannot be composited.');

  let activeCorner = corner;
  let stopped = false;

  const drawFrame = () => {
    if (stopped) return;
    const { width, height } = canvas;

    if (screenVideo.readyState >= 2) {
      ctx.drawImage(screenVideo, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    }

    if (cameraVideo.readyState >= 2 && cameraVideo.videoWidth > 0) {
      const diameter = Math.max(MIN_BUBBLE_PX, Math.round(width * BUBBLE_DIAMETER));
      const margin = Math.round(width * BUBBLE_MARGIN);
      const x = activeCorner.endsWith('right') ? width - diameter - margin : margin;
      const y = activeCorner.startsWith('bottom') ? height - diameter - margin : margin;
      const { sx, sy, size } = coverCrop(cameraVideo.videoWidth, cameraVideo.videoHeight);

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      // Not mirrored: the preview shows the composite, so the creator sees
      // exactly what viewers see rather than a self-view that lies.
      ctx.drawImage(cameraVideo, sx, sy, size, size, x, y, diameter, diameter);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, Math.round(diameter * 0.02));
      ctx.stroke();
    }
  };

  /**
   * Frame pump. requestVideoFrameCallback is the good one — it fires per
   * decoded frame of the screen capture, so the composite keeps its rate while
   * the creator is looking at their game rather than the tab. rAF is the
   * fallback (Firefox has no rVFC) and the interval is a floor under both:
   * a backgrounded tab throttles rAF to a stop and timers to roughly 1Hz, so
   * viewers get a slow picture rather than a frozen one.
   */
  type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  const pump = screenVideo as FrameCallbackVideo;
  let rafHandle = 0;
  let frameHandle = 0;

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

  const watchdog = window.setInterval(drawFrame, 250);

  drawFrame();
  const stream = canvas.captureStream(FRAME_RATE);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('The composited canvas produced no video track.');

  logger.info('Camera bubble composited', {
    width: canvas.width,
    height: canvas.height,
    pump: typeof pump.requestVideoFrameCallback === 'function' ? 'rvfc' : 'raf',
  });

  return {
    track,
    setCorner: (next: BubbleCorner) => {
      activeCorner = next;
      drawFrame();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(watchdog);
      if (rafHandle) cancelAnimationFrame(rafHandle);
      if (frameHandle && typeof pump.cancelVideoFrameCallback === 'function') {
        pump.cancelVideoFrameCallback(frameHandle);
      }
      track.stop();
      // Detaching is what lets the elements be collected; the tracks inside
      // belong to the caller and keep running.
      screenVideo.srcObject = null;
      cameraVideo.srcObject = null;
    },
  };
}
