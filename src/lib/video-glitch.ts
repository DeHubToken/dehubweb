/**
 * Video Glitch Loader — the preference
 * ====================================
 * Whether a video that is still loading shows the RGB-split / TV-static
 * glitch treatment over its first frame, or just the frame itself.
 *
 * Off by default. The glitch is loud by design, and on a feed it fires once
 * per card — pleasant as an accent, tiring as the resting state. Off, the
 * loader still reads as a loader: the poster, dimmed, with a soft pulse.
 *
 * Tiny on purpose, like lib/skip-segments: VideoGlitchLoader reads it and
 * VideoGlitchLoader is on the boot path (scripts/boot-path-baseline.json), so
 * it must not pull a context in. Editing is a switch in Settings and the
 * account sync is registered once in ViewingPreferencesSync.
 *
 * @module lib/video-glitch
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'video-glitch-loader';
const CHANGE_EVENT = 'video-glitch-changed';

export function readVideoGlitch(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeVideoGlitch(value: boolean) {
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

export function useVideoGlitch(): boolean {
  return useSyncExternalStore(subscribe, readVideoGlitch, () => false);
}
