/**
 * Online presence — "show when I'm online"
 * ========================================
 * Off by default. A person who turns it on is tracked on one shared Supabase
 * Realtime presence channel for as long as they have the app open anywhere;
 * everyone else reads it only while a visible dot needs it. Nobody who left the switch off ever
 * appears on it, so the green dot on Messages is consent, not surveillance.
 *
 * Presence rather than a `last_seen` column: the socket already knows when a
 * tab closes, so the dot goes out on its own within seconds — a heartbeat
 * table would need a writer every minute from every open tab and a sweeper to
 * decide when "recently" stopped being "now".
 *
 * The switch is a flat key in the account `customs` blob, next to aiScraping,
 * so web and the mobile app read the same choice. The topic and presence key
 * are shared with dehub-mobile too — keep them in step: topic `online-users`,
 * key = lower-cased wallet address.
 *
 * The channel itself is held by components/app/OnlinePresenceHost, a lazy
 * chunk; this file stays small because Messages and Settings import it.
 *
 * @module lib/online-presence
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const SHOW_ONLINE_CUSTOMS_KEY = 'showOnline';

/** Shared with dehub-mobile — see the header. */
export const ONLINE_PRESENCE_TOPIC = 'online-users';

/** Only an explicit 'on' opts in; absent or anything else is off. */
export function getShowOnline(customs: Record<string, unknown> | null | undefined): boolean {
  const v = customs?.[SHOW_ONLINE_CUSTOMS_KEY];
  return v === 'on' || v === true;
}

/** Read-merge-resend: the API does not merge customs, see lib/ai-scraping. */
export function mergeShowOnline(
  customs: Record<string, string> | undefined | null,
  on: boolean,
): Record<string, string> {
  return { ...(customs ?? {}), [SHOW_ONLINE_CUSTOMS_KEY]: on ? 'on' : 'off' };
}

// ─── Who is online ───────────────────────────────────────────────────────────

let online: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let readers = 0;
const demandListeners = new Set<() => void>();

function subscribeDemand(listener: () => void) {
  demandListeners.add(listener);
  return () => { demandListeners.delete(listener); };
}

/** Visible dots need a reader; hidden cached pages do not. */
export function registerPresenceReader(): () => void {
  readers += 1;
  if (readers === 1) for (const listener of [...demandListeners]) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    readers -= 1;
    if (readers === 0) for (const listener of [...demandListeners]) listener();
  };
}

export function usePresenceReaders(): boolean {
  return useSyncExternalStore(subscribeDemand, () => readers > 0, () => false);
}

export function publishOnline(next: ReadonlySet<string>) {
  online = next;
  for (const listener of [...listeners]) listener();
}

export function onlineFromChannel(channel: RealtimeChannel): ReadonlySet<string> {
  return new Set(Object.keys(channel.presenceState()).map((k) => k.toLowerCase()));
}

function subscribeOnline(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** True while `address` has the switch on and the app open somewhere. */
export function useIsOnline(address: string | null | undefined, enabled = true): boolean {
  const key = address?.toLowerCase() ?? '';
  useEffect(() => {
    if (!key || !enabled) return;
    return registerPresenceReader();
  }, [key, enabled]);
  return useSyncExternalStore(
    subscribeOnline,
    () => enabled && !!key && online.has(key),
    () => false,
  );
}
