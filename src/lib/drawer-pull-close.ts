import { slideOut } from '@/hooks/use-sheet-flick-close';

/**
 * Drag a full-height list drawer between two resting heights, and down to
 * close it.
 *
 * The sheet is the full screen tall. It rests lowered by a fifth of the
 * screen ("part open", so the page above shows it is a drawer), or raised to
 * fill the screen ("full"). The offset is the CSS `translate` property, so it
 * composes with the `transform` vaul uses to slide the sheet in and out.
 *
 * Used with vaul's `handleOnly`, so this is the drawer's only drag:
 *
 * - Part open, any vertical drag moves the sheet: up to fill the screen, down
 *   to close. The list does not scroll until the sheet is full.
 * - Full, the list scrolls as usual. A pull down only moves the sheet when
 *   the list was already at the top when the finger went down and was not
 *   still gliding from a fling, so a swipe that scrolls back up and reaches
 *   the top stays a scroll.
 * - Released, the sheet settles at the nearest sensible height: a short or
 *   stopped pull springs back; from full, a pull steps back to part open and
 *   a long one closes; from part open, a pull past a quarter of the sheet or a
 *   clear flick down closes.
 * - Sideways swipes (the tab strip) are left alone, and a tap on the dimmed
 *   page above the sheet closes it.
 * - Focusing a text field (the search pill) fills the screen.
 */
const SLOP = 6;
/** px/ms the finger must still be moving at release to count as a flick. */
const FLICK_SPEED = 0.3;
/** A flick also has to have moved the sheet this far. */
const FLICK_MIN_PULL = 72;
/** Pulled this share of the visible sheet closes on a slow release too. */
const CLOSE_SHARE = 0.25;
/** Share of the screen the sheet sits lowered by when part open. */
export const PART_OPEN_DROP = 0.2;
/** A list scrolled this recently is still gliding from a fling. */
const SCROLL_SETTLE_MS = 140;
const SPEED_WINDOW_MS = 100;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Sample = { t: number; y: number };

export type DrawerPullOptions = {
  /**
   * false: one resting height (the sheet's own), as a full sheet that only
   * pulls down to close. Used by the bell's settings sheet.
   */
  snap?: boolean;
};

export function bindDrawerPullClose(sheet: HTMLElement, scroller: HTMLElement, close: () => void, { snap = true }: DrawerPullOptions = {}) {
  let lastScrollAt = 0;
  let mode: 'idle' | 'pending' | 'drag' | 'off' = 'idle';
  let startX = 0;
  let startY = 0;
  let atTop = true;
  let expanded = !snap;
  let offset = 0;
  let samples: Sample[] = [];

  const partOpen = () => (snap ? Math.round(window.innerHeight * PART_OPEN_DROP) : 0);
  const base = () => (expanded ? 0 : partOpen());

  const overlay = () => {
    const prev = sheet.previousElementSibling as HTMLElement | null;
    return prev?.hasAttribute('data-vaul-overlay') ? prev : null;
  };
  const fadeFor = (y: number) => {
    const visible = Math.max(1, (sheet.offsetHeight || window.innerHeight) - partOpen());
    return Math.max(0, Math.min(1, 1 - (y - partOpen()) / visible));
  };
  const place = (y: number) => {
    sheet.style.transition = 'none';
    sheet.style.translate = `0 ${y}px`;
    const o = overlay();
    if (o) {
      o.style.transition = 'none';
      o.style.opacity = String(fadeFor(y));
    }
  };
  const settle = (full: boolean) => {
    expanded = full || !snap;
    if (!snap) {
      // Nothing to toggle.
    } else if (full) sheet.setAttribute('data-expanded', '');
    else sheet.removeAttribute('data-expanded');
    sheet.style.transition = `translate 0.45s ${EASE}, padding-top 0.45s ${EASE}`;
    sheet.style.translate = `0 ${base()}px`;
    const o = overlay();
    if (o) {
      o.style.transition = `opacity 0.45s ${EASE}`;
      o.style.opacity = '1';
    }
    if (!full) scroller.scrollTop = 0;
  };

  // Rest part open from the first frame.
  if (snap) sheet.style.translate = `0 ${partOpen()}px`;

  const onScroll = () => {
    lastScrollAt = performance.now();
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      if (mode === 'drag') settle(expanded);
      mode = 'off';
      return;
    }
    const target = e.target as Element | null;
    atTop = scroller.scrollTop <= 0 && performance.now() - lastScrollAt > SCROLL_SETTLE_MS;
    const blocked = !!target?.closest?.('[data-vaul-no-drag], input, textarea, select, [contenteditable="true"]');
    mode = blocked ? 'off' : 'pending';
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    offset = base();
    samples = [{ t: e.timeStamp, y: t.clientY }];
  };

  const onMove = (e: TouchEvent) => {
    if (mode === 'off' || mode === 'idle') return;
    const t = e.touches[0];
    if (!t) return;
    if (mode === 'pending') {
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx === 0 && dy === 0) return;
      // Decided on the first move: iOS Safari only lets the first touchmove
      // stop the list's own scroll (and its rubber band).
      const vertical = Math.abs(dy) >= Math.abs(dx);
      const takes = vertical && (!expanded || (dy > 0 && atTop && scroller.scrollTop <= 0));
      if (takes) {
        mode = 'drag';
      } else if (!vertical && Math.abs(dx) < SLOP) {
        return;
      } else {
        mode = 'off';
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    let y = base() + (t.clientY - startY);
    // Past full, it gives a little and stops.
    if (y < 0) y = y / 4;
    offset = y;
    samples.push({ t: e.timeStamp, y: t.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > SPEED_WINDOW_MS) samples.shift();
    place(y);
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
    const mid = partOpen();
    const visible = Math.max(1, (sheet.offsetHeight || window.innerHeight) - mid);
    const belowMid = offset - mid;
    const shut = belowMid >= visible * CLOSE_SHARE || (belowMid >= FLICK_MIN_PULL && speed >= FLICK_SPEED);
    if (shut) {
      slideOut(sheet);
      const o = overlay();
      if (o) {
        o.style.transition = 'opacity 0.4s ease-out';
        o.style.opacity = '0';
      }
      close();
      return;
    }
    if (!snap) {
      settle(true);
      return;
    }
    if (!expanded) {
      // Up far enough, or flicked up: fill the screen.
      const rose = mid - offset;
      settle(rose >= 48 || (rose >= 16 && speed <= -FLICK_SPEED));
      return;
    }
    // From full: a clear pull or flick down steps back to part open.
    settle(!(offset >= mid / 2 || (offset >= FLICK_MIN_PULL && speed >= FLICK_SPEED)));
  };

  const onCancel = () => {
    if (mode === 'drag') settle(expanded);
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

  // Typing in the search field fills the screen, so the matches can scroll.
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as Element | null;
    if (snap && !expanded && t?.matches?.('input, textarea')) settle(true);
  };
  sheet.addEventListener('focusin', onFocusIn);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove', onMove, { passive: false });
  sheet.addEventListener('touchend', onEnd);
  sheet.addEventListener('touchcancel', onCancel);
  return () => {
    scrim?.removeEventListener('click', onScrimTap);
    sheet.removeEventListener('focusin', onFocusIn);
    scroller.removeEventListener('scroll', onScroll);
    sheet.removeEventListener('touchstart', onStart);
    sheet.removeEventListener('touchmove', onMove);
    sheet.removeEventListener('touchend', onEnd);
    sheet.removeEventListener('touchcancel', onCancel);
  };
}
