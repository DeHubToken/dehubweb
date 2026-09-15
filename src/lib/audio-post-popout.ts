/**
 * Is a track in the corner player?
 * ================================
 * The one bit of `lib/audio-post-playback` the app shell needs *before* that
 * module is worth loading. `AppLayout` mounts the corner player app-wide so a
 * popped-out track survives navigation, but it shows nothing until somebody
 * pops one out — and reading the engine to find that out put the engine, the
 * panel and its waveform on the boot path, parsed before first paint.
 *
 * So the flag lives here instead, in a file small enough to sit on that path,
 * and the engine pushes to it. Nothing else should: it mirrors the engine.
 *
 * @module lib/audio-post-popout
 */

import { useEffect, useState } from 'react';

let poppedOut = false;
const listeners = new Set<(next: boolean) => void>();

/** Called by the engine whenever it takes or drops a track. */
export function setAudioPostPoppedOut(next: boolean): void {
  if (next === poppedOut) return;
  poppedOut = next;
  for (const notify of listeners) notify(poppedOut);
}

/** The flag, for callers outside React. */
export function isAudioPostPoppedOut(): boolean {
  return poppedOut;
}

/** Whether the corner player has something to show. */
export function useAudioPostPoppedOut(): boolean {
  const [value, setValue] = useState(poppedOut);
  useEffect(() => {
    // The engine may have taken a track between render and effect.
    setValue(poppedOut);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
