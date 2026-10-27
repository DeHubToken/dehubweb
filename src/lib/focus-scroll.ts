/**
 * Bring the comment a notification named into view, and keep it there until
 * the page has settled.
 *
 * One `scrollIntoView` was not enough on the post page. The row renders while
 * the post above it is still growing: the link preview swaps its skeleton for
 * an image, the media takes its real height, the author thread and the other
 * threads arrive. Every one of those pushed the row down after the scroll had
 * finished, so it came to rest under the comment box at the bottom of the
 * screen. The glow it was given played while it was still off screen.
 *
 * So: centre it, watch the page for size changes and re-centre after each one,
 * and stop as soon as the reader scrolls, taps or types themselves, or after a
 * few seconds. Then flash the row, once it is actually where they can see it.
 *
 * @module lib/focus-scroll
 */

const SETTLE_MS = 3500;
const QUIET_MS = 450;
const FLASH_CLASS = 'focus-target-flash';
const FLASH_MS = 2200;

/** Rows already being brought into view, so two callers never fight. */
const active = new WeakSet<Element>();

function centre(el: Element, smooth: boolean) {
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center', inline: 'nearest' });
}

function flash(el: Element) {
  el.classList.remove(FLASH_CLASS);
  // Restart the animation if the row was flashed before.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(FLASH_CLASS);
  window.setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_MS);
}

/**
 * Scrolls `el` to the middle of the screen and holds it there through layout
 * shifts. Returns a function that stops early.
 */
export function bringIntoViewAndFlash(el: Element): () => void {
  if (active.has(el)) return () => {};
  active.add(el);

  const reduceMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stopped = false;
  let quietTimer = 0;
  let lastTop = Number.NaN;

  const finish = (showFlash: boolean) => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(quietTimer);
    window.clearTimeout(hardStop);
    observer?.disconnect();
    for (const type of USER_EVENTS) window.removeEventListener(type, onUser, true);
    active.delete(el);
    if (showFlash && el.isConnected) flash(el);
  };

  // The page is quiet once the row stops moving for a beat.
  const armQuiet = () => {
    window.clearTimeout(quietTimer);
    quietTimer = window.setTimeout(() => finish(true), QUIET_MS);
  };

  const recentre = () => {
    if (stopped || !el.isConnected) return finish(false);
    const top = el.getBoundingClientRect().top;
    // Nothing above it moved: nothing to correct.
    if (Math.abs(top - lastTop) < 2) return;
    centre(el, false);
    lastTop = el.getBoundingClientRect().top;
    armQuiet();
  };

  // The reader took over: leave the page where they put it.
  const onUser = () => finish(true);
  const USER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  for (const type of USER_EVENTS) window.addEventListener(type, onUser, { capture: true, passive: true });

  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => requestAnimationFrame(recentre))
    : null;
  // Every ancestor, not just the body: the comments panel scrolls inside
  // itself on the post page, and content growing in there is a shift the body
  // never sees.
  for (let node = el.parentElement; node && observer; node = node.parentElement) {
    observer.observe(node);
  }

  centre(el, !reduceMotion);
  // A smooth scroll is still travelling; measure where it is heading, not
  // where it is, so the first resize after it does not count as a shift.
  window.setTimeout(() => {
    if (stopped) return;
    lastTop = el.getBoundingClientRect().top;
    armQuiet();
  }, reduceMotion ? 0 : 350);
  const hardStop = window.setTimeout(() => finish(true), SETTLE_MS);

  return () => finish(false);
}
