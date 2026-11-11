import { slideOut } from '@/hooks/use-sheet-flick-close';

/**
 * Pull a full-height list drawer down from anywhere on it to close it.
 *
 * Used with vaul's `handleOnly`, so this is the drawer's only drag. The rules
 * are there so a reader scrolling back up never closes the sheet by mistake:
 *
 * - A pull only starts when the list was already at the top when the finger
 *   went down, and was not still gliding from a fling. A swipe that scrolls
 *   the list up and reaches the top part way through stays a scroll.
 * - Sideways swipes (the tab strip) and upward swipes are left alone.
 * - A tap on the dimmed page above the sheet closes it too.
 * - On release it closes when pulled past a quarter of the sheet, or pulled
 *   a clear distance with the finger still moving down. Anything less springs
 *   back to the top.
 */
const SLOP = 6;
/** px/ms the finger must still be moving down at release to flick it shut. */
const FLICK_SPEED = 0.3;
/** A flick also has to have moved the sheet this far. */
const FLICK_MIN_PULL = 72;
/** Pulled this share of the sheet's height closes on a slow release too. */
const CLOSE_SHARE = 0.25;
/** A list scrolled this recently is still gliding from a fling. */
const SCROLL_SETTLE_MS = 140;
const SPEED_WINDOW_MS = 100;
const SPRING_BACK = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';

type Sample = { t: number; y: number };

export function bindDrawerPullClose(sheet: HTMLElement, scroller: HTMLElement, close: () => void) {
  let lastScrollAt = 0;
  let mode: 'idle' | 'pending' | 'drag' | 'off' = 'idle';
  let startX = 0;
  let startY = 0;
  let anchorY = 0;
  let pulled = 0;
  let samples: Sample[] = [];

  const overlay = () => {
    const prev = sheet.previousElementSibling as HTMLElement | null;
    return prev?.hasAttribute('data-vaul-overlay') ? prev : null;
  };
  const place = (y: number) => {
    sheet.style.transition = 'none';
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
    const o = overlay();
    if (o) {
      o.style.transition = 'none';
      o.style.opacity = String(Math.max(0, 1 - y / (sheet.offsetHeight || window.innerHeight)));
    }
  };
  const springBack = () => {
    sheet.style.transition = SPRING_BACK;
    sheet.style.transform = 'translate3d(0, 0, 0)';
    const o = overlay();
    if (o) {
      o.style.transition = 'opacity 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
      o.style.opacity = '1';
    }
  };

  const onScroll = () => {
    lastScrollAt = performance.now();
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      if (mode === 'drag') springBack();
      mode = 'off';
      return;
    }
    const target = e.target as Element | null;
    const atTop = scroller.scrollTop <= 0;
    const settled = performance.now() - lastScrollAt > SCROLL_SETTLE_MS;
    const blocked = !!target?.closest?.('[data-vaul-no-drag], input, textarea, select, [contenteditable="true"]');
    mode = atTop && settled && !blocked ? 'pending' : 'off';
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    pulled = 0;
    samples = [{ t: e.timeStamp, y: t.clientY }];
  };

  const onMove = (e: TouchEvent) => {
    if (mode === 'off' || mode === 'idle') return;
    const t = e.touches[0];
    if (!t) return;
    if (mode === 'pending') {
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Decided on the first move that heads down: iOS Safari only lets the
      // first touchmove stop the list's own scroll (and its rubber band), so
      // waiting a few pixels left the list bouncing under the sheet.
      if (dy > 0 && dy >= Math.abs(dx) && scroller.scrollTop <= 0) {
        mode = 'drag';
        anchorY = startY;
      } else if (Math.abs(dx) >= SLOP || dy <= -SLOP || dy > 0) {
        mode = 'off';
        return;
      } else {
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    pulled = Math.max(0, t.clientY - anchorY);
    samples.push({ t: e.timeStamp, y: t.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > SPEED_WINDOW_MS) samples.shift();
    place(pulled);
  };

  const onEnd = (e: TouchEvent) => {
    const wasDrag = mode === 'drag';
    mode = 'idle';
    if (!wasDrag) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    // A gap since the last move means the finger stopped before letting go.
    const idle = e.timeStamp - last.t;
    const speed = idle > 60 ? 0 : (last.y - first.y) / Math.max(1, last.t - first.t);
    const height = sheet.offsetHeight || window.innerHeight;
    const shut = pulled >= height * CLOSE_SHARE || (pulled >= FLICK_MIN_PULL && speed >= FLICK_SPEED);
    if (!shut) {
      springBack();
      return;
    }
    slideOut(sheet);
    const o = overlay();
    if (o) {
      o.style.transition = 'opacity 0.4s ease-out';
      o.style.opacity = '0';
    }
    close();
  };

  const onCancel = () => {
    if (mode === 'drag') springBack();
    mode = 'idle';
  };

  // Tapping the dimmed page above the sheet closes it. Radix's outside-tap
  // dismiss alone did not reliably fire on iPhone.
  const scrim = overlay();
  const onScrimTap = (e: Event) => {
    e.preventDefault();
    close();
  };
  scrim?.addEventListener('click', onScrimTap);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove', onMove, { passive: false });
  sheet.addEventListener('touchend', onEnd);
  sheet.addEventListener('touchcancel', onCancel);
  return () => {
    scrim?.removeEventListener('click', onScrimTap);
    scroller.removeEventListener('scroll', onScroll);
    sheet.removeEventListener('touchstart', onStart);
    sheet.removeEventListener('touchmove', onMove);
    sheet.removeEventListener('touchend', onEnd);
    sheet.removeEventListener('touchcancel', onCancel);
  };
}
