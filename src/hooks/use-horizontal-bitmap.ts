import { useEffect, useState, type RefObject } from 'react';

/** A photo loads once it is within a viewport of the one in view... */
export const HORIZONTAL_LOAD_MARGIN = '0px 100%';
/** ...and only unloads once it is more than three viewports away. */
export const HORIZONTAL_RELEASE_MARGIN = '0px 300%';

/**
 * Gallery photos load as the strip nears them and unload once far away, so a
 * 30+ photo post only fetches the photos around the one in view. Pinned
 * slides (single photo, active ±2) always load and never unload. The gap
 * between the two margins keeps a back-and-forth swipe from unloading and
 * redrawing the photo just passed.
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
    const load = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (timer) clearTimeout(timer);
      timer = undefined;
      setRetained(true);
    }, { root, rootMargin: HORIZONTAL_LOAD_MARGIN });
    const release = new IntersectionObserver(([entry]) => {
      if (timer) clearTimeout(timer);
      // Hidden page (no box): keep what is loaded rather than blanking it.
      if (!entry.isIntersecting && entry.boundingClientRect.width === 0 && entry.boundingClientRect.height === 0) { timer = undefined; return; }
      timer = entry.isIntersecting ? undefined : setTimeout(() => setRetained(false), 400);
    }, { root, rootMargin: HORIZONTAL_RELEASE_MARGIN });
    load.observe(node);
    release.observe(node);
    return () => {
      load.disconnect();
      release.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [source, measured, viewportRef, slideRef, pinned]);
  return pinned || retained;
}
