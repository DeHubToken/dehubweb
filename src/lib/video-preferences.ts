import { useSyncExternalStore } from 'react';
/**
 * Video Preferences
 * =================
 * Persists user video playback preferences (speed, loop, volume) in localStorage.
 * All video players read from and write to these shared preferences.
 *
 * Speed is remembered per creator. Set 1.5× on someone who talks slowly and it
 * stays 1.5× for them next time, while everyone else keeps playing at normal
 * speed. A speed picked on one creator's video never follows the viewer onto
 * anyone else's. Players with no creator (TV) share the general rate.
 */

const STORAGE_KEY = 'video-preferences';

interface VideoPreferences {
  playbackRate: number;
  isLooping: boolean;
  volume: number;
  mediaMuted: boolean | null;
  /** Lowercased creator address → the rate chosen while watching them. */
  ratesByCreator: Record<string, number>;
  /** 2 once speeds are kept per creator only; older blobs carried one speed everywhere. */
  rateScope?: number;
}

const RATE_SCOPE = 2;

const DEFAULTS: VideoPreferences = {
  playbackRate: 1,
  isLooping: false,
  volume: 0.8,
  mediaMuted: null,
  ratesByCreator: {},
  rateScope: RATE_SCOPE,
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
        isLooping: stored?.isLooping === true,
        // One tap on a creator's speed button used to move every other video
        // to that speed as well. Blobs written back then go back to normal
        // speed once; the creators that were tuned keep their own.
        playbackRate: stored?.rateScope === RATE_SCOPE && stored?.playbackRate > 0 ? stored.playbackRate : DEFAULTS.playbackRate,
        rateScope: RATE_SCOPE,
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

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: VideoPreferences | null = null;
function flushSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  const prefs = pendingSave; pendingSave = null;
  if (!prefs) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  window.dispatchEvent(new CustomEvent('video-prefs-changed', { detail: prefs }));
}
const mediaListeners = new Set<() => void>();
const loopListeners = new Set<() => void>();
function save(prefs: VideoPreferences) {
  const before = getVideoPreferences();
  const mediaChanged = before.volume !== prefs.volume || before.mediaMuted !== prefs.mediaMuted;
  const loopChanged = before.isLooping !== prefs.isLooping;
  // The next tap reads the new rate immediately; storage and every mounted
  // player's preference listener must not run in the control's input event.
  cached = prefs; pendingSave = prefs;
  if (mediaChanged) mediaListeners.forEach(fn => fn());
  if (loopChanged) loopListeners.forEach(fn => fn());
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 0);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSave);

/**
 * Set the playback rate. With the creator whose video is playing, the rate is
 * remembered for them alone and every other video keeps its own speed. With
 * no creator it becomes the general rate.
 */
export function setPlaybackRate(rate: number, creatorId?: string | null) {
  const prefs = getVideoPreferences();
  const key = normaliseCreator(creatorId);
  save(key
    ? { ...prefs, ratesByCreator: { ...prefs.ratesByCreator, [key]: rate } }
    : { ...prefs, playbackRate: rate });
}

/** The rate to start a creator's video at — theirs if pinned, else the general one. */
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

/** The whole map, for the account sync to push. */
export function getCreatorPlaybackRates(): Record<string, number> {
  return { ...getVideoPreferences().ratesByCreator };
}

/**
 * Replace the map wholesale — what the account sync applies on sign-in, so a
 * device adopts the channels tuned on another one. Server wins: a rate this
 * device set while signed out is not merged back in, or a channel deliberately
 * reset elsewhere would keep coming back.
 */
export function setCreatorPlaybackRates(rates: Record<string, number>) {
  const clean: Record<string, number> = {};
  for (const [creator, rate] of Object.entries(rates ?? {})) {
    const key = normaliseCreator(creator);
    if (key && typeof rate === 'number' && rate > 0) clean[key] = rate;
  }
  const prefs = getVideoPreferences();
  save({ ...prefs, ratesByCreator: clean });
}

function normaliseCreator(creatorId?: string | null): string | null {
  const key = (creatorId ?? '').trim().toLowerCase();
  return key || null;
}

export function setIsLooping(looping: boolean) {
  const prefs = getVideoPreferences();
  const next = { ...prefs, isLooping: looping };
  // Persist in the tap before a close or suspension can stop the save timer.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  save(next);
}

const subscribeLoop = (fn: () => void) => { loopListeners.add(fn); return () => loopListeners.delete(fn); };
export const useMediaLooping = () => useSyncExternalStore(subscribeLoop, () => getVideoPreferences().isLooping, () => false);

export function setVolume(volume: number) {
  const prefs = getVideoPreferences();
  save({ ...prefs, volume: Math.max(0, Math.min(1, volume)) });
}

export function formatRate(rate: number): string {
  return rate.toFixed(2);
}

export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

const subscribeMedia = (fn: () => void) => { mediaListeners.add(fn); return () => mediaListeners.delete(fn); };
export function getMediaVolume(): number {
  const v = getVideoPreferences().volume;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULTS.volume;
}
export const useMediaVolume = () => useSyncExternalStore(subscribeMedia, getMediaVolume, () => DEFAULTS.volume);
/**
 * Whether a video the viewer opened (post page, fullscreen, a tap on play)
 * should start silent. Only their own mute tap counts: the feed's automatic
 * muting never wrote here, so with no choice on record it plays with sound.
 */
export const openedVideoMuted = () => getVideoPreferences().mediaMuted === true;
export const useMediaMuted = () => useSyncExternalStore(subscribeMedia, () => getVideoPreferences().mediaMuted === true, () => false);
export function setMediaMuted(muted: boolean) {
  const prefs = { ...getVideoPreferences(), mediaMuted: muted };
  // Closing or suspending the app can stop timers without a pagehide event.
  // Commit this choice in the tap itself; notifications can remain deferred.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  save(prefs);
}
