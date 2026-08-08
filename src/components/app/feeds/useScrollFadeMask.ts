import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

/** How much of the row dissolves at an overflowing edge. */
const FADE_PX = 24;

/**
 * Fades the overflowing edges of a horizontal scroller by masking the row
 * itself, so the content dissolves into whatever is behind it.
 *
 * The filter rows used to paint a `from-black` gradient strip on top instead,
 * which has to guess the surface colour: on mobile the filter panel is
 * portalled into the zinc-900 feed nav, so the black strip read as a solid
 * black box rather than a fade, and any non-dark theme would show it as an
 * outright black bar. A mask has no colour of its own, so it blends on any
 * background.
 *
 * The mask is applied only on a side that actually has hidden content — a row
 * that fits, or one scrolled to its end, is never clipped.
 *
 * Pass the scroller's existing ref when the caller already has one; otherwise
 * use the returned `ref`.
 */
export function useScrollFadeMask<T extends HTMLElement>(externalRef?: RefObject<T | null>) {
  const internalRef = useRef<T>(null);
  const ref = externalRef ?? internalRef;
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    const next = { start: false, end: false };

    if (max > 1) {
      // RTL scrollers report scrollLeft as 0 at the right edge down to -max at
      // the left one, so derive the hidden width on each physical side.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const hiddenLeft = rtl ? max + el.scrollLeft : el.scrollLeft;
      next.start = hiddenLeft > 1;
      next.end = max - hiddenLeft > 1;
    }

    setEdges(prev => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref]);

  // Runs after every render so chips arriving later (categories loading, a
  // search narrowing the list) re-measure without the caller wiring up deps.
  useLayoutEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    el.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [ref, measure]);

  const style = useMemo<CSSProperties | undefined>(() => {
    if (!edges.start && !edges.end) return undefined;
    const start = edges.start ? FADE_PX : 0;
    const end = edges.end ? FADE_PX : 0;
    const mask = `linear-gradient(to right, transparent 0px, #000 ${start}px, #000 calc(100% - ${end}px), transparent 100%)`;
    return { maskImage: mask, WebkitMaskImage: mask };
  }, [edges]);

  return { ref, style };
}
