import { useEffect, useState, type RefObject } from 'react';

/** Release measured gallery images outside the carousel without losing geometry. */
export function useHorizontalBitmap(source: string, measured: boolean, viewportRef: RefObject<HTMLDivElement>, slideRef: RefObject<HTMLDivElement>) {
  const [retained, setRetained] = useState(true);
  useEffect(() => {
    setRetained(true);
    const root = viewportRef.current;
    const node = slideRef.current;
    if (!root || !node || !measured || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (timer) clearTimeout(timer);
      const viewport = root.getBoundingClientRect();
      const slide = entry.boundingClientRect;
      // Vertical retention owns the feed's scroll-back buffer and grace period.
      const horizontallyVisible = slide.right > viewport.left - 32 && slide.left < viewport.right + 32;
      if (horizontallyVisible) setRetained(true);
      else timer = setTimeout(() => setRetained(false), 400);
    }, { root, rootMargin: '0px 32px' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [source, measured, viewportRef, slideRef]);
  return retained;
}
