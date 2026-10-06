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
    // rootMargin already supplies the 32px buffer; trust the observer's own snapshot.
    const observer = new IntersectionObserver(([entry]) => {
      if (timer) clearTimeout(timer);
      if (entry.isIntersecting) setRetained(true);
      else timer = setTimeout(() => setRetained(false), 400);
    }, { root, rootMargin: '0px 32px' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [source, measured, viewportRef, slideRef, pinned]);
  return pinned || retained;
}
