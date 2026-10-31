import { useEffect, useState, type RefObject } from 'react';

/**
 * Gallery photos load as the strip nears them and unload once far away, so a
 * 30+ photo post only fetches the photos around the one in view. Pinned
 * slides (single photo, active ±2) always load and never unload.
 */
export function useHorizontalBitmap(source: string, measured: boolean, viewportRef: RefObject<HTMLDivElement>, slideRef: RefObject<HTMLDivElement>, pinned = false) {
  const [retained, setRetained] = useState(pinned);
  useEffect(() => {
    // Without an observer (or a shape yet) there is nothing to window by.
    if (!viewportRef.current || !measured || typeof IntersectionObserver === 'undefined') setRetained(true);
    const root = viewportRef.current;
    const node = slideRef.current;
    if (pinned || !root || !node || !measured || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A full viewport each side keeps the photo just passed drawn, so swiping
    // back is as instant as swiping forward (the next one is preloaded by the
    // browser's lazy loading; the previous one had been unloaded and redrawn).
    const observer = new IntersectionObserver(([entry]) => {
      if (timer) clearTimeout(timer);
      if (entry.isIntersecting) setRetained(true);
      else timer = setTimeout(() => setRetained(false), 400);
    }, { root, rootMargin: '0px 100%' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [source, measured, viewportRef, slideRef, pinned]);
  return pinned || retained;
}
