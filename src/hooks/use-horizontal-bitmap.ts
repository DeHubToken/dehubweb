import { useEffect, useState, type RefObject } from 'react';

/**
 * Release measured gallery images outside the carousel without losing geometry.
 * Relies on the observer's own intersection state (rootMargin gives a 32px
 * buffer) so snapshot vs. live rect mismatches during scroll can't hide a
 * visible slide. Single-image carousels and the active slide ±1 never unload.
 */
export function useHorizontalBitmap(
  source: string,
  measured: boolean,
  viewportRef: RefObject<HTMLDivElement>,
  slideRef: RefObject<HTMLDivElement>,
  options: { total?: number; index?: number; activeIndex?: number } = {},
) {
  const { total, index, activeIndex } = options;
  const pinned = total === 1 || (index != null && activeIndex != null && Math.abs(index - activeIndex) <= 1);
  const [retained, setRetained] = useState(true);
  useEffect(() => {
    setRetained(true);
    if (pinned) return;
    const root = viewportRef.current;
    const node = slideRef.current;
    if (!root || !node || !measured || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (entry.isIntersecting) setRetained(true);
      else timer = setTimeout(() => setRetained(false), 400);
    }, { root, rootMargin: '0px 32px' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [source, measured, pinned, viewportRef, slideRef]);
  return pinned || retained;
}
