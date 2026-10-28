/**
 * A finger that lands on a page still gliding from a fling only stops it.
 *
 * Native apps work this way: the touch that halts momentum is never a tap on
 * whatever slid under it. In the browser that touch reaches the feed as a full
 * tap, so a reader stopping the feed to read a post opened it (or its photo,
 * or its video) instead.
 *
 * The whole gesture is held at the window in the capture phase, before React
 * or any card sees it, so no card is left with half a gesture. Window-level
 * listeners (the scroll watchdogs, the tap-pending logo) still run. Touch
 * only: a mouse or trackpad never changes.
 */

/** Momentum paints a scroll every frame; a gap longer than this is a page at rest. */
const MOMENTUM_GAP_MS = 120;
/** The compatibility click lands right after touchend. */
const CLICK_WINDOW_MS = 450;

const tops = new WeakMap<object, number>();
let lastScrollAt = -Infinity;
/** What was gliding: a scroller element, or the document itself. */
let glider: object | null = null;
let lastLiftAt = -Infinity;
let fingers = 0;
let holding = false;
let releaseTimer = 0;

function scrollTopOf(target: EventTarget | null): [object, number] | null {
  if (target === document || target === window) {
    const root = document.scrollingElement || document.documentElement;
    return [document, root.scrollTop];
  }
  if (target instanceof Element) return [target, target.scrollTop];
  return null;
}

function onScroll(e: Event): void {
  const entry = scrollTopOf(e.target);
  if (!entry) return;
  const [key, top] = entry;
  const before = tops.get(key);
  tops.set(key, top);
  // Only vertical travel: a carousel sliding sideways is not the feed moving.
  if (before !== undefined && before !== top) {
    lastScrollAt = performance.now();
    glider = key;
  }
}

/** True while a lifted finger has left the page still gliding. */
export function isPageGliding(): boolean {
  if (fingers > 0) return false;
  const now = performance.now();
  return lastScrollAt > lastLiftAt && now - lastScrollAt < MOMENTUM_GAP_MS;
}

/** The touch now down is one that stopped a glide; nothing under it should act. */
export function isScrollStopTouch(): boolean {
  return holding;
}

/**
 * Whether the finger landed on the thing that is gliding. A button fixed over
 * the page (a top bar, a viewer's Back, the bottom nav) does not move with the
 * glide, so stopping the feed is no reason to eat its tap.
 */
function landsOnGlide(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (glider instanceof Element) return glider.contains(target);
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return false;
  }
  return true;
}

function begin(target: EventTarget | null): void {
  if (fingers > 0 || holding) return;
  window.clearTimeout(releaseTimer);
  holding = isPageGliding() && landsOnGlide(target);
}

function swallow(e: Event): void {
  if (!holding) return;
  e.stopPropagation();
}

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType !== 'touch') return;
  begin(e.target);
  swallow(e);
}

function onPointer(e: PointerEvent): void {
  if (e.pointerType === 'touch') swallow(e);
}

function onTouchStart(e: TouchEvent): void {
  begin(e.target);
  fingers = e.touches.length;
  swallow(e);
}

function onTouchEnd(e: TouchEvent): void {
  fingers = e.touches.length;
  if (fingers === 0) lastLiftAt = performance.now();
  if (!holding) return;
  e.stopPropagation();
  if (fingers > 0) return;
  // No compatibility mouse events or click for the touch that stopped the glide.
  if (e.cancelable) e.preventDefault();
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => { holding = false; }, CLICK_WINDOW_MS);
}

function onClick(e: MouseEvent): void {
  if (!holding) return;
  e.preventDefault();
  e.stopPropagation();
  window.clearTimeout(releaseTimer);
  holding = false;
}

/**
 * iOS already does this natively: a touch that halts momentum never becomes a
 * click there. Its scroll events also reach the page late whenever the main
 * thread is busy, so the gap check below read a page at rest as still gliding
 * and ate the next real tap on a feed button ("buttons sometimes don't work").
 */
function nativeGlideStop(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installScrollStopTap(): () => void {
  if (typeof window === 'undefined' || nativeGlideStop()) return () => {};
  const passive = { capture: true, passive: true } as const;
  const active = { capture: true, passive: false } as const;
  window.addEventListener('scroll', onScroll, passive);
  window.addEventListener('pointerdown', onPointerDown, passive);
  window.addEventListener('pointermove', onPointer, passive);
  window.addEventListener('pointerup', onPointer, passive);
  window.addEventListener('pointercancel', onPointer, passive);
  window.addEventListener('touchstart', onTouchStart, passive);
  window.addEventListener('touchmove', swallow, passive);
  window.addEventListener('touchend', onTouchEnd, active);
  window.addEventListener('touchcancel', onTouchEnd, active);
  window.addEventListener('click', onClick, active);
  return () => {
    window.removeEventListener('scroll', onScroll, passive);
    window.removeEventListener('pointerdown', onPointerDown, passive);
    window.removeEventListener('pointermove', onPointer, passive);
    window.removeEventListener('pointerup', onPointer, passive);
    window.removeEventListener('pointercancel', onPointer, passive);
    window.removeEventListener('touchstart', onTouchStart, passive);
    window.removeEventListener('touchmove', swallow, passive);
    window.removeEventListener('touchend', onTouchEnd, active);
    window.removeEventListener('touchcancel', onTouchEnd, active);
    window.removeEventListener('click', onClick, active);
    window.clearTimeout(releaseTimer);
    holding = false;
    glider = null;
    fingers = 0;
  };
}
