import { useEffect, useState } from 'react';

/**
 * "The page has loaded and had one idle moment."
 *
 * The point after which a large optional download — an above-the-fold autoplay
 * clip, a prefetch — no longer competes with the first paint for bandwidth.
 * Module-level so every subscriber shares one listener and one answer, and so
 * a chunk that arrives after `load` (every lazy route does) reads it as already
 * settled instead of waiting for an event that has been and gone.
 */
let settled = typeof document !== 'undefined' && document.readyState === 'complete';
const listeners = new Set<() => void>();

function markSettled() {
  settled = true;
  for (const l of listeners) l();
  listeners.clear();
}

if (typeof window !== 'undefined' && !settled) {
  window.addEventListener(
    'load',
    () => {
      // One idle tick after load, not load itself: the LCP image is often still
      // decoding at that moment. The timeout keeps a permanently busy main
      // thread from deferring this forever.
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(markSettled, { timeout: 2500 });
      } else {
        setTimeout(markSettled, 500);
      }
    },
    { once: true },
  );
}

export function useBootSettled(): boolean {
  const [value, setValue] = useState(settled);
  useEffect(() => {
    if (settled) {
      setValue(true);
      return;
    }
    const l = () => setValue(true);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return value;
}
