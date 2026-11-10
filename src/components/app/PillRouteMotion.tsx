import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Phones: every page shares the home feed's top pill. When the page changes,
 * the new page's pill starts where the old one was and glides to its own
 * spot (up from under the home header, back down on the way home), and the
 * new contents fade up inside it, so it reads as one pill moving.
 *
 * The pill's position is noted on the tap (or back gesture) that starts the
 * navigation, before the new page draws. Renders nothing; mount once.
 */
const PHONE = '(max-width: 1023px)';

function visiblePill(): HTMLElement | null {
  const pills = document.querySelectorAll<HTMLElement>('[data-feed-nav]');
  for (const el of pills) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && el.checkVisibility?.({ visibilityProperty: true }) !== false) {
      return el;
    }
  }
  return null;
}

export function PillRouteMotion(): null {
  const { pathname } = useLocation();
  const lastTop = useRef<number | null>(null);
  const lastEl = useRef<HTMLElement | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const note = () => {
      const el = visiblePill();
      lastEl.current = el;
      lastTop.current = el ? el.getBoundingClientRect().top : null;
    };
    window.addEventListener('pointerdown', note, true);
    window.addEventListener('popstate', note, true);
    return () => {
      window.removeEventListener('pointerdown', note, true);
      window.removeEventListener('popstate', note, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const from = lastTop.current;
    const oldEl = lastEl.current;
    lastTop.current = null;
    lastEl.current = null;
    if (from == null || !window.matchMedia(PHONE).matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // A page that has not been opened yet mounts a few frames after the
    // route changes (its code loads on demand), so wait for its pill.
    let raf = 0;
    let frames = 0;
    const run = () => {
      const el = visiblePill();
      if (!el || el === oldEl) {
        if (++frames < 90) raf = requestAnimationFrame(run);
        return;
      }
      const dy = from - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1 && Math.abs(dy) < 160) {
        // A page pill moves with the row under it (search, filters).
        const mover = el.closest<HTMLElement>('[data-kit-pill-outer]') ?? el;
        mover.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
      }
      const row = el.querySelector<HTMLElement>(':scope > div');
      row?.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: 80, easing: 'ease-out', fill: 'backwards' },
      );
    };
    run();
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
