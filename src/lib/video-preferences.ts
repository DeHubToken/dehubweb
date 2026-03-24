/**
 * Video Preferences
 * =================
 * Persists user video playback preferences (speed, loop, volume) in localStorage.
 * All video players read from and write to these shared preferences.
 */

const STORAGE_KEY = 'video-preferences';

interface VideoPreferences {
  playbackRate: number;
  isLooping: boolean;
  volume: number;
}

const DEFAULTS: VideoPreferences = {
  playbackRate: 1,
  isLooping: false,
  volume: 0.8,
};

let cached: VideoPreferences | null = null;

export function getVideoPreferences(): VideoPreferences {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = { ...DEFAULTS, ...JSON.parse(raw) };
      return cached!;
    }
  } catch {}
  cached = { ...DEFAULTS };
  return cached;
}

function save(prefs: VideoPreferences) {
  cached = prefs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
  // Notify other components via storage event workaround
  window.dispatchEvent(new CustomEvent('video-prefs-changed', { detail: prefs }));
}

export function setPlaybackRate(rate: number) {
  const prefs = getVideoPreferences();
  save({ ...prefs, playbackRate: rate });
}

export function setIsLooping(looping: boolean) {
  const prefs = getVideoPreferences();
  save({ ...prefs, isLooping: looping });
}

export function setVolume(volume: number) {
  const prefs = getVideoPreferences();
  save({ ...prefs, volume: Math.max(0, Math.min(1, volume)) });
}

export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
