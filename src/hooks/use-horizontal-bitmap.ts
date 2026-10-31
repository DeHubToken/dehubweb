import { useEffect, useState, type RefObject } from 'react';

/** Release far-offscreen gallery images; pinned slides (single, active ±1) never unload. */
export function useHorizontalBitmap(source: string, measured: boolean, viewportRef: RefObject<HTMLDivElement>, slideRef: RefObject<HTMLDivElement>, pinned = false) {
  const [retained, setRetained] = useState(true);
  useEffect(() => {
    setRetained(true);
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
