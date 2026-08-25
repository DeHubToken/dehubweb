/**
 * ViewingPreferencesSync — carries the per-channel playback speeds to the
 * account's other devices.
 *
 * Renders nothing. Speeds are written by the players straight into
 * localStorage (they need the value synchronously, before the first frame),
 * which is why this cannot live in the player: something mounted once has to
 * own the round trip. It registers the map with the preference blob, applies
 * whatever the server has on sign-in, and pushes again whenever a player
 * announces a write.
 *
 * The "hide watched" switch syncs itself from `useHideWatched` — its consumers
 * are the feeds and the settings row, which is where it is read and written.
 *
 * @module components/app/ViewingPreferencesSync
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';
import { getCreatorPlaybackRates, setCreatorPlaybackRates } from '@/lib/video-preferences';

const PREF_KEY = 'videoChannelSpeeds';
const EMPTY: Record<string, number> = {};

export function ViewingPreferencesSync() {
  const [rates, setRates] = useState<Record<string, number>>(() => getCreatorPlaybackRates());

  // What the server last handed us. A server-applied map re-fires the same
  // change event the players use, and without this the echo would be pushed
  // straight back as if the user had set it.
  const appliedRef = useRef<string | null>(null);

  const apply = useCallback((value: unknown) => {
    const map = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, number>)
      : EMPTY;
    appliedRef.current = JSON.stringify(map);
    setCreatorPlaybackRates(map);
    setRates(getCreatorPlaybackRates());
  }, []);

  const { push } = useSyncedPreference(PREF_KEY, rates, apply, EMPTY);

  useEffect(() => {
    const handler = () => {
      const next = getCreatorPlaybackRates();
      const serialised = JSON.stringify(next);
      setRates(next);
      if (serialised === appliedRef.current) return; // our own echo
      appliedRef.current = serialised;
      push(next);
    };
    window.addEventListener('video-prefs-changed', handler);
    return () => window.removeEventListener('video-prefs-changed', handler);
  }, [push]);

  return null;
}
