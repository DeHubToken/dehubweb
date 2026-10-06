/**
 * Renders nothing. Holds the "show when I'm online" presence channel for the
 * session — see lib/online-presence. Its own lazy chunk so the channel and
 * the profile query it reads stay off the boot path.
 *
 * Joins in the foreground when opted in or when a visible dot needs a reader.
 * Turning the switch off stops publishing; hidden cached pages add no demand.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { leaseChannel } from '@/lib/realtime-channel-lease';
import {
  ONLINE_PRESENCE_TOPIC,
  getShowOnline,
  onlineFromChannel,
  publishOnline,
  usePresenceReaders,
} from '@/lib/online-presence';

export default function OnlinePresenceHost() {
  const { walletAddress, isAuthenticated } = useAuth();
  const me = isAuthenticated && walletAddress ? walletAddress.toLowerCase() : null;
  const { data: profile } = useDeHubProfile({ userId: walletAddress || undefined, enabled: !!me });
  const showOnline = getShowOnline(profile?.customs);
  const hasReaders = usePresenceReaders();
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const needed = showOnline || hasReaders;

  useEffect(() => {
    if (!me || !visible || !needed) return;
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
  }, [me, showOnline, visible, needed]);

  return null;
}
