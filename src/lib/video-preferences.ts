/**
 * Video Preferences
 * =================
 * Persists user video playback preferences (speed, loop, volume) in localStorage.
 * All video players read from and write to these shared preferences.
 *
 * Speed is remembered per creator as well as globally. Set 1.5× on someone who
 * talks slowly and it stays 1.5× for them next time, while everyone else keeps
 * playing at whatever you last used generally — a channel you have never tuned
 * inherits the global rate, a channel you have keeps its own.
 */

const STORAGE_KEY = 'video-preferences';

interface VideoPreferences {
  playbackRate: number;
  isLooping: boolean;
  volume: number;
  /** Lowercased creator address → the rate chosen while watching them. */
  ratesByCreator: Record<string, number>;
}

const DEFAULTS: VideoPreferences = {
  playbackRate: 1,
  isLooping: false,
  volume: 0.8,
  ratesByCreator: {},
};

let cached: VideoPreferences | null = null;

export function getVideoPreferences(): VideoPreferences {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      cached = {
        ...DEFAULTS,
        ...stored,
        // Spread alone would carry through a null/array left by an older blob
        // and every read of it would then throw on lookup.
        ratesByCreator:
          stored?.ratesByCreator && !Array.isArray(stored.ratesByCreator) && typeof stored.ratesByCreator === 'object'
            ? stored.ratesByCreator
            : {},
      };
      return cached!;
    }
  } catch {}
  cached = { ...DEFAULTS, ratesByCreator: {} };
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

/**
 * Set the playback rate. Passing the creator whose video is playing also
 * remembers the rate for them: the global rate still moves, so the next
 * untouched channel inherits the habit, but this one is now pinned.
 */
export function setPlaybackRate(rate: number, creatorId?: string | null) {
  const prefs = getVideoPreferences();
  const key = normaliseCreator(creatorId);
  save({
    ...prefs,
    playbackRate: rate,
    ratesByCreator: key ? { ...prefs.ratesByCreator, [key]: rate } : prefs.ratesByCreator,
  });
}

/** The rate to start a creator's video at — theirs if pinned, else the global one. */
export function getPlaybackRateFor(creatorId?: string | null): number {
  const prefs = getVideoPreferences();
  const key = normaliseCreator(creatorId);
  const pinned = key ? prefs.ratesByCreator[key] : undefined;
  return typeof pinned === 'number' && pinned > 0 ? pinned : prefs.playbackRate;
}

/** Whether this creator has a rate of their own, for the settings summary. */
export function hasCreatorPlaybackRate(creatorId?: string | null): boolean {
  const key = normaliseCreator(creatorId);
  return !!key && typeof getVideoPreferences().ratesByCreator[key] === 'number';
}

/** How many channels have a pinned rate — drives the settings row's count. */
export function getCreatorPlaybackRateCount(): number {
  return Object.keys(getVideoPreferences().ratesByCreator).length;
}

/** Forget every per-channel rate. The global rate is left alone. */
export function clearCreatorPlaybackRates() {
  const prefs = getVideoPreferences();
  save({ ...prefs, ratesByCreator: {} });
}

function normaliseCreator(creatorId?: string | null): string | null {
  const key = (creatorId ?? '').trim().toLowerCase();
  return key || null;
}

export function setIsLooping(looping: boolean) {
  const prefs = getVideoPreferences();
  save({ ...prefs, isLooping: looping });
}

export function setVolume(volume: number) {
  const prefs = getVideoPreferences();
  save({ ...prefs, volume: Math.max(0, Math.min(1, volume)) });
}

export function formatRate(rate: number): string {
  return rate.toFixed(2);
}

export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
