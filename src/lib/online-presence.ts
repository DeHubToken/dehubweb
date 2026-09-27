/**
 * Online presence — "show when I'm online"
 * ========================================
 * Off by default. A person who turns it on is tracked on one shared Supabase
 * Realtime presence channel for as long as they have the app open anywhere;
 * everyone else only reads that channel. Nobody who left the switch off ever
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
 * @module lib/online-presence
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { leaseChannel } from '@/lib/realtime-channel-lease';

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

function publish(next: ReadonlySet<string>) {
  online = next;
  for (const listener of [...listeners]) listener();
}

function fromChannel(channel: RealtimeChannel): ReadonlySet<string> {
  return new Set(Object.keys(channel.presenceState()).map((k) => k.toLowerCase()));
}

function subscribeOnline(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** True while `address` has the switch on and the app open somewhere. */
export function useIsOnline(address: string | null | undefined): boolean {
  const key = address?.toLowerCase() ?? '';
  return useSyncExternalStore(
    subscribeOnline,
    () => !!key && online.has(key),
    () => false,
  );
}

/**
 * Mounted once, in AppLayout. Joins the channel while signed in so the dots
 * can be read, and tracks this account only while the switch is on — turning
 * it off untracks immediately rather than waiting for the tab to close.
 */
export function useOnlinePresence() {
  const { walletAddress, isAuthenticated } = useAuth();
  const me = isAuthenticated && walletAddress ? walletAddress.toLowerCase() : null;
  const { data: profile } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!me });
  const showOnline = getShowOnline(profile?.customs);

  useEffect(() => {
    if (!me) return;
    const lease = leaseChannel(ONLINE_PRESENCE_TOPIC, {
      config: { presence: { key: me } },
      listen: [{ type: 'presence', filter: { event: 'sync' }, handler: (_p, chan) => publish(fromChannel(chan)) }],
      onJoin: (chan) => {
        if (showOnline) void chan.track({ at: new Date().toISOString() });
        else void chan.untrack();
      },
    });
    return () => {
      lease.release();
      publish(new Set());
    };
  }, [me, showOnline]);
}
