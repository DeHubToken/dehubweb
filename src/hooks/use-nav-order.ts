/**
 * Read + edit one surface's nav order, with the account push.
 *
 * `save` takes the new on-screen order. Ids that weren't on screen (filtered
 * out, or only on the other platform) keep their place via mergeNavOrder.
 *
 * @module hooks/use-nav-order
 */

import { useCallback } from 'react';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import {
  NAV_ORDER_PREF_KEYS,
  mergeNavOrder,
  readNavOrder,
  useNavOrder,
  writeNavOrder,
  type NavOrderSurface,
} from '@/lib/nav-order';

export function useNavOrderEditor(surface: NavOrderSurface, defaultIds: string[]) {
  const order = useNavOrder(surface);
  // setPref rather than useSyncedPreference: ViewingPreferencesSync owns the
  // inbound half, and a second registration would race it.
  const prefs = useUserPreferences();

  const save = useCallback((visible: string[]) => {
    const saved = readNavOrder(surface);
    const next = mergeNavOrder(saved.length ? saved : defaultIds, visible);
    writeNavOrder(surface, next);
    prefs?.setPref(NAV_ORDER_PREF_KEYS[surface], next);
  }, [surface, defaultIds, prefs]);

  const reset = useCallback(() => {
    writeNavOrder(surface, []);
    prefs?.setPref(NAV_ORDER_PREF_KEYS[surface], []);
  }, [surface, prefs]);

  return { order, customised: order.length > 0, save, reset };
}
