/**
 * Reactive `(min-width: 1024px)` viewport flag (Tailwind's `lg`).
 *
 * Use to skip MOUNTING desktop-only UI on mobile instead of hiding it with
 * `hidden lg:block` — CSS-hidden components still run their queries, intervals
 * and animations for chrome that can never be seen.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

export function useIsDesktopViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
