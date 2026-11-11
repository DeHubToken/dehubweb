/**
 * Slow-device mode for the audio animations.
 *
 * A fast machine draws every style at full quality on every screen refresh.
 * A slow one cannot keep up with that: the glow blurs and the 2x canvas are
 * what cost the most. When frames keep arriving late the animations drop to
 * 30 frames a second, a 1x canvas and no glow, and stay there for the visit.
 */
type Listener = () => void;

const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } });
let low = !!nav && ((nav.hardwareConcurrency || 8) <= 2 || (nav.deviceMemory || 8) <= 2 || !!nav.connection?.saveData);
let lateFrames = 0;
const listeners = new Set<Listener>();

export const LOW_FRAME_MS = 1000 / 30;
/** A frame this late means the page is under 30 frames a second. */
const LATE_GAP_MS = 36;
const SLOW_DRAW_MS = 8;
/** About a second and a half of late frames in a row before stepping down. */
const LATE_LIMIT = 45;

export const visualizerLowPower = () => low;
export const subscribeLowPower = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Call once per drawn frame with how long the draw took and the gap since the last one. */
export function noteVisualizerFrame(drawMs: number, gapMs: number) {
  if (low) return;
  // A gap of seconds is a tab coming back, not a slow device.
  const late = drawMs > SLOW_DRAW_MS || (gapMs > LATE_GAP_MS && gapMs < 1000);
  lateFrames = late ? lateFrames + 1 : Math.max(0, lateFrames - 2);
  if (lateFrames < LATE_LIMIT) return;
  low = true;
  listeners.forEach((listener) => listener());
}

const calmed = new WeakSet<CanvasRenderingContext2D>();
/** Turns the glow off on this canvas: every painter sets shadowBlur, and it is the dearest thing they do. */
export function calmContext(ctx: CanvasRenderingContext2D) {
  if (calmed.has(ctx)) return;
  calmed.add(ctx);
  ctx.shadowBlur = 0;
  try { Object.defineProperty(ctx, 'shadowBlur', { configurable: true, get: () => 0, set: () => {} }); } catch { /* Glow stays on. */ }
}
