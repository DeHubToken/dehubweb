/**
 * Left-handed mode — mirrors the post reactions bar so the thumbs-up sits at
 * the left edge, under a left thumb, instead of the right.
 *
 * Per device, not per account: it follows the hand holding this screen, so
 * it lives in localStorage and syncs across tabs via the storage event.
 */

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'left-handed-mode';
const LOCAL_EVENT = 'left-handed-mode-change';

function read(): boolean {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

export function useLeftHanded() {
  const leftHanded = useSyncExternalStore(subscribe, read, () => false);
  const setLeftHanded = useCallback((value: boolean) => {
    try { localStorage.setItem(KEY, String(value)); } catch {}
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, []);
  return { leftHanded, setLeftHanded };
}
