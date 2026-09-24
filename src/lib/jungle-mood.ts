import { useSyncExternalStore } from 'react';

/**
 * Jungle time of day.
 * ===================
 * The Jungle theme has its own light/dark switch: a bright late-morning day or
 * a dusky blue evening. It is a property of the Jungle scene only, not an app
 * theme, so it lives here beside the other jungle bus (jungle-cinematic)
 * rather than in ThemeContext — switching it must not re-render the app, and
 * the WebGL scene reads it every frame while it cross-fades.
 *
 * Persisted per device, and mirrored onto <html data-jungle-mood> so chrome
 * CSS can follow it if it ever needs to.
 */

export type JungleMood = 'day' | 'evening';

const STORAGE_KEY = 'dehub.jungleMood';

function read(): JungleMood {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'evening' ? 'evening' : 'day';
  } catch {
    return 'day';
  }
}

let mood: JungleMood = typeof window === 'undefined' ? 'day' : read();
const listeners = new Set<(value: JungleMood) => void>();

if (typeof document !== 'undefined') document.documentElement.dataset.jungleMood = mood;

export function getJungleMood(): JungleMood {
  return mood;
}

export function setJungleMood(value: JungleMood): void {
  if (value === mood) return;
  mood = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // private mode — the switch still works for this session
  }
  document.documentElement.dataset.jungleMood = value;
  for (const l of listeners) l(value);
}

export function subscribeJungleMood(listener: (value: JungleMood) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useJungleMood(): [JungleMood, (value: JungleMood) => void] {
  const value = useSyncExternalStore(subscribeJungleMood, getJungleMood, () => 'day' as JungleMood);
  return [value, setJungleMood];
}
