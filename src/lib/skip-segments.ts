/**
 * Skip Segments — the preference
 * ==============================
 * Whether the player jumps over crowdsourced sponsor reads and intros.
 *
 * Off by default. Skipping a sponsor read is a decision about someone else's
 * income, so it is one the viewer makes deliberately rather than one they
 * discover has been made for them.
 *
 * Tiny on purpose, like lib/ad-load: the video card reads it and the video
 * card is on the boot path. Editing is a switch in Settings and the account
 * sync is registered once in ViewingPreferencesSync.
 *
 * @module lib/skip-segments
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'skip-video-segments';
const CHANGE_EVENT = 'skip-segments-changed';

export function readSkipSegments(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSkipSegments(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
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

export function useSkipSegments(): boolean {
  return useSyncExternalStore(subscribe, readSkipSegments, () => false);
}
