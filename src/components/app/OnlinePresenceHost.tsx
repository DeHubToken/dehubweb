/**
 * Renders nothing. Holds the "show when I'm online" presence channel for the
 * session — see lib/online-presence. Its own lazy chunk so the channel and
 * the profile query it reads stay off the boot path.
 *
 * Joins while signed in so the dots can be read, and tracks this account only
 * while the switch is on — turning it off untracks immediately rather than
 * waiting for the tab to close.
 */
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { leaseChannel } from '@/lib/realtime-channel-lease';
import {
  ONLINE_PRESENCE_TOPIC,
  getShowOnline,
  onlineFromChannel,
  publishOnline,
} from '@/lib/online-presence';

export default function OnlinePresenceHost() {
  const { walletAddress, isAuthenticated } = useAuth();
  const me = isAuthenticated && walletAddress ? walletAddress.toLowerCase() : null;
  const { data: profile } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!me });
  const showOnline = getShowOnline(profile?.customs);

  useEffect(() => {
    if (!me) return;
    const lease = leaseChannel(ONLINE_PRESENCE_TOPIC, {
      config: { presence: { key: me } },
      listen: [{ type: 'presence', filter: { event: 'sync' }, handler: (_p, chan) => publishOnline(onlineFromChannel(chan)) }],
      onJoin: (chan) => {
        if (showOnline) void chan.track({ at: new Date().toISOString() });
        else void chan.untrack();
      },
    });
    return () => {
      lease.release();
      publishOnline(new Set());
    };
  }, [me, showOnline]);

  return null;
}
