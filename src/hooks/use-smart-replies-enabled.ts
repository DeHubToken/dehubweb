/**
 * Suggested replies on/off — device-local.
 *
 * The × on the rail is the switch. Dismissing used to mean "not for this
 * message", which made it a control that appeared to do nothing: the rail came
 * straight back with the next message, so anyone who did not want the feature
 * had to close it again in every thread, forever. It now turns the feature off
 * and Settings → Messages turns it back on.
 *
 * Two surfaces write this (the rail's × and the settings switch) and a third
 * reads it in another tab, so it goes through `useSyncExternalStore` with a
 * same-tab event alongside `storage` — the same shape
 * `use-browser-notifications` uses for its flag, and for the same reason: a
 * plain `useState` in each surface leaves the settings switch showing "on"
 * after the rail has just been dismissed behind it.
 *
 * Absent means ON. Only "off" is ever stored, so a reader who never touches
 * this gets the feature, and clearing site data restores the default rather
 * than silently keeping it switched off.
 *
 * dehub-mobile mirrors this under the same key name — see its
 * `hooks/useAppPrefs.ts` (`smartReplies`).
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'dehub_smart_replies';

/** Same-tab change signal — `storage` only fires in the *other* tabs. */
const CHANGE_EVENT = 'dehub:smart-replies-changed';

export function getSmartRepliesEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSmartRepliesEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {}

  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {}
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useSmartRepliesEnabled(): boolean {
  // Server snapshot is `true` so the rail is not marked hidden during SSR/
  // prerender and then flipped on at hydration.
  return useSyncExternalStore(subscribe, getSmartRepliesEnabled, () => true);
}
