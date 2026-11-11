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
    // route changes (its code loads on demand), so wait for its pill. While it
    // loads, phones show the page's empty pill skeleton in the same spot
    // (PageSkeletons PhonePillSkeleton): the glide runs on that, and the real
    // pill's contents fade in when the page lands, so the pill never jumps.
    let raf = 0;
    let frames = 0;
    let skeleton: HTMLElement | null = null;
    let skeletonTop = 0;
    const glide = (el: HTMLElement, fromTop: number) => {
      const dy = fromTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1 && Math.abs(dy) < 160) {
        // A page pill moves with the row under it (search, filters).
        const mover = el.closest<HTMLElement>('[data-kit-pill-outer]') ?? el;
        mover.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
      }
    };
    const fadeIn = (el: HTMLElement) => {
      const row = el.querySelector<HTMLElement>(':scope > div');
      row?.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: 80, easing: 'ease-out', fill: 'backwards' },
      );
    };
    const isSkeleton = (el: HTMLElement) => !!el.closest('[data-pill-skeleton]');
    const run = () => {
      const el = visiblePill();
      if (skeleton) {
        // Follow the skeleton (it may still be gliding) until the page lands.
        if (el === skeleton || !el || isSkeleton(el)) {
          if (el) { skeleton = el; skeletonTop = el.getBoundingClientRect().top; }
          if (++frames < 360) raf = requestAnimationFrame(run);
          return;
        }
        glide(el, skeletonTop);
        fadeIn(el);
        return;
      }
      if (!el || el === oldEl) {
        if (++frames < 90) raf = requestAnimationFrame(run);
        return;
      }
      glide(el, from);
      if (isSkeleton(el)) {
        skeleton = el;
        skeletonTop = el.getBoundingClientRect().top;
        frames = 0;
        raf = requestAnimationFrame(run);
        return;
      }
      fadeIn(el);
    };
    run();
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
