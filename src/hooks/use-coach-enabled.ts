/**
 * Coaching suggestions on/off — device-local.
 *
 * Absent means ON. The value is read by the comment composer (to offer the
 * "Check my tone" button) and by the Common Ground sheet (to run the final
 * review), and written from Settings. Same `useSyncExternalStore` shape as
 * `use-smart-replies-enabled`, for the same reason: two surfaces read it and a
 * plain `useState` in each would leave one stale after the other flips it.
 *
 * dehub-mobile mirrors this under the same key name in `hooks/useAppPrefs.ts`
 * (`coach`).
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'dehub.coach.enabled';
const CHANGE_EVENT = 'dehub:coach-enabled-changed';

export function getCoachEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setCoachEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
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

export function useCoachEnabled(): boolean {
  return useSyncExternalStore(subscribe, getCoachEnabled, () => true);
}
