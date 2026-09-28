/**
 * Shared loop for the 2D-canvas theme backgrounds (Island, Hacker, Horror).
 *
 * The WebGL themes each carry their own loop; these three are plain canvas
 * scenes, so the housekeeping lives here once: size to the viewport with a
 * capped pixel ratio, cap the frame rate, stop while the docs/blog glass is
 * over the canvas (background-gate) or the tab is hidden, and paint a single
 * still frame for reduced motion.
 *
 * The mobile app bundles these same scenes into its theme backdrop page
 * (dehub-mobile scripts/theme-backdrop), so they must not import anything
 * app-specific beyond the background gate.
 */
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';
import { createFrameThrottle } from '@/lib/raf-throttle';

export interface CanvasScene {
  /** Called on start and on every resize, in CSS pixels. */
  resize?(w: number, h: number): void;
  /**
   * Paint one frame. `t` is seconds since the scene started, `dt` seconds
   * since the last painted frame (0 for the first).
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number): void;
}

export interface CanvasBackdropOptions {
  fps?: number;
  dprCap?: number;
}

export function runCanvasBackdrop(
  canvas: HTMLCanvasElement,
  scene: CanvasScene,
  { fps = 30, dprCap = 1.5 }: CanvasBackdropOptions = {},
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const throttle = createFrameThrottle(fps);
  let w = 0;
  let h = 0;
  let raf = 0;
  let start = performance.now();
  let last = 0;
  let pausedAt = 0;

  const size = () => {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.resize?.(w, h);
  };

  const paint = (now: number) => {
    const t = (now - start) / 1000;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    scene.draw(ctx, w, h, t, dt);
  };

  const running = () => !reduced && !isBackgroundPaused() && document.visibilityState === 'visible';

  const tick = (now: number) => {
    raf = 0;
    if (!running()) return;
    if (throttle(now)) paint(now);
    raf = requestAnimationFrame(tick);
  };

  const resume = () => {
    if (raf || !running()) return;
    // Continue the scene's clock from where it stopped rather than jumping.
    if (pausedAt) start += performance.now() - pausedAt;
    pausedAt = 0;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!pausedAt) pausedAt = performance.now();
  };

  const onResize = () => {
    size();
    // Resizing clears the canvas; repaint at once so a paused scene is not blank.
    paint(pausedAt || performance.now());
  };

  const onVisibility = () => (running() ? resume() : pause());

  size();
  paint(performance.now());
  if (!reduced) raf = requestAnimationFrame(tick);

  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  const unsubscribe = subscribeBackgroundPaused((p) => (p ? pause() : resume()));

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
  };
}

/** A small tile of grey noise, drawn scaled up for film grain and tape static. */
export function makeNoiseTile(w: number, h: number, alpha: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return c;
  const img = x.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = alpha;
  }
  x.putImageData(img, 0, 0);
  return c;
}
