import { useSyncExternalStore } from 'react';

/**
 * A phone post page that was not opened from the home feed (a notification,
 * a profile, a shared link) still looks like one that was: the logo bar and the
 * feed pill with Back stay on top instead of a floating back square. The post
 * page turns this on while it shows a text, image or audio post that way, and
 * the mobile header reads it to keep the logo bar up.
 */
let on = false;
const listeners = new Set<() => void>();

export function setPostFeedLook(value: boolean) {
  if (on === value) return;
  on = value;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePostFeedLook(): boolean {
  return useSyncExternalStore(subscribe, () => on, () => false);
}
