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

/**
 * "The visitor has done something" — one scroll, tap, click, wheel or key.
 *
 * Deferring an autoplay clip to after load turned out not to be enough: the
 * moment a muted clip starts playing, Chrome streams the whole file, and a
 * 15-second feed clip here is 12–15 MB. So on first paint the above-the-fold
 * clips wait for this as well. The poster is already on screen; the first
 * scroll — which is how anyone uses a feed — is what starts the video, and
 * a page nobody touches costs nobody 27 MB. Same module-level latch pattern
 * as above, one set of passive listeners for the whole app.
 */
let interacted = false;
const interactionListeners = new Set<() => void>();
const INTERACTION_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll'] as const;

function markInteracted() {
  if (interacted) return;
  interacted = true;
  for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, markInteracted);
  for (const l of interactionListeners) l();
  interactionListeners.clear();
}

if (typeof window !== 'undefined') {
  for (const ev of INTERACTION_EVENTS) {
    window.addEventListener(ev, markInteracted, { passive: true, capture: true });
  }
}

export function useFirstInteraction(): boolean {
  const [value, setValue] = useState(interacted);
  useEffect(() => {
    if (interacted) {
      setValue(true);
      return;
    }
    const l = () => setValue(true);
    interactionListeners.add(l);
    return () => {
      interactionListeners.delete(l);
    };
  }, []);
  return value;
}
