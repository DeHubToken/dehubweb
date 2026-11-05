/**
 * "Show the number on the bell" — a per-reader choice, off by default.
 *
 * The bell normally says "something new" with its red glow and nothing else.
 * Some readers want the count itself, so it is a switch in Settings →
 * Notifications rather than a change for everyone. Kept on this device, like
 * the theme, so it applies before anything has loaded.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'riftn.notifications.showCount';
const EVENT = 'riftn:notification-count-pref';

export function getShowNotificationCount(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowNotificationCount(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the switch just won't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useShowNotificationCount(): boolean {
  return useSyncExternalStore(subscribe, getShowNotificationCount, () => false);
}

/** "7", "99+" */
export function formatNotificationCount(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}
