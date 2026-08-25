/**
 * Ad Load
 * =======
 * How often a sponsored post appears in the home feed. Standard is one every
 * eight posts, which is what the feed has always done; Fewer halves it.
 *
 * There is no "none": ads are how the creators in the feed get paid, and a
 * switch that turned the money off entirely would be a different decision than
 * the one this setting is making. The ask this answers is the middle option —
 * fewer, not zero.
 *
 * Kept deliberately small, like lib/follow-groups: the home feed reads it and
 * the home feed is on the boot path. Editing is one select in Settings, and
 * the account sync is registered once in ViewingPreferencesSync.
 *
 * @module lib/ad-load
 */

import { useSyncExternalStore } from 'react';

export type AdLoad = 'standard' | 'fewer';

/** Organic posts between sponsored ones. */
export const AD_INTERVALS: Record<AdLoad, number> = {
  standard: 8,
  fewer: 16,
};

export const DEFAULT_AD_LOAD: AdLoad = 'standard';

const STORAGE_KEY = 'feed-ad-load';
const CHANGE_EVENT = 'ad-load-changed';

export function normaliseAdLoad(value: unknown): AdLoad {
  return value === 'fewer' ? 'fewer' : DEFAULT_AD_LOAD;
}

export function readAdLoad(): AdLoad {
  try {
    return normaliseAdLoad(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_AD_LOAD;
  }
}

export function writeAdLoad(value: AdLoad) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** A string, so the snapshot is stable by value — no cache needed. */
export function useAdLoad(): AdLoad {
  return useSyncExternalStore(subscribe, readAdLoad, () => DEFAULT_AD_LOAD);
}
