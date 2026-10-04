import { useLayoutEffect, useRef } from 'react';

/** Inline artwork uses the name's font metrics even when only the name is styled. */
export function useInlineBadgeFont<T extends HTMLElement = HTMLSpanElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const badge = ref.current;
    if (!badge) return;
    const parent = badge.parentElement;
    const sibling = badge.previousElementSibling;
    const name = sibling?.textContent?.trim() && !sibling.matches('[data-badge-playing], [data-streamer-badge]')
      ? sibling : parent;
    if (!name) return;
    const sync = () => {
      const font = getComputedStyle(name);
      badge.style.fontSize = font.fontSize;
      badge.style.fontFamily = font.fontFamily;
      badge.style.fontWeight = font.fontWeight;
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(name);
    return () => observer.disconnect();
  });
  return ref;
}
