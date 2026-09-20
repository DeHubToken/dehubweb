import { useEffect, useState } from 'react';
import { getStreamActivities, type StreamActivity } from '@/lib/api/dehub/livestream';
import { watchStreamJoins } from '@/lib/api/dehub/stream-presence';

/**
 * Keep the FIRST arrival per identified viewer; reconnects are not new people.
 * The socket re-emits a join on every reconnect, and keeping the latest copy
 * moved a viewer's arrival below the tip they had already sent.
 */
export function uniqueStreamJoins(joins: StreamActivity[]): StreamActivity[] {
  const seen = new Set<string>();
  return [...joins].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).filter((join) => {
    const address = join.address?.toLowerCase();
    if (!address) return true;
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

/** Seed recorded arrivals, then append every arrival while this chat is open. */
export function useStreamChatJoins(streamId?: string, offline = false) {
  const [state, setState] = useState<{ streamId?: string; joins: StreamActivity[] }>({ joins: [] });
  useEffect(() => {
    setState({ streamId, joins: [] });
    if (!streamId) return;
    let cancelled = false;
    let sequence = 0;
    const pending: StreamActivity[] = [];
    let loaded = false;
    const subscription = offline ? null : watchStreamJoins(streamId, (user) => {
      const event: StreamActivity = {
        id: `arrival:${streamId}:${++sequence}`,
        type: 'join', address: user.address || '',
        username: user.displayName || user.username,
        timestamp: new Date().toISOString(),
      };
      if (!loaded) pending.push(event);
      else setState((prev) => ({ streamId, joins: uniqueStreamJoins([...prev.joins, event]).slice(-300) }));
    });
    getStreamActivities(streamId, { unit: 200 }).then(({ result }) => {
      if (cancelled) return;
      const history = result.filter((a) => a.type === 'join');
      // An arrival can be in both the initial request and the socket response.
      const fresh = pending.filter((event) => !history.some((a) =>
        a.address.toLowerCase() === event.address.toLowerCase() &&
        Math.abs(Date.parse(a.timestamp) - Date.parse(event.timestamp)) < 2000));
      setState({ streamId, joins: uniqueStreamJoins([...history, ...fresh]) });
    }).catch(() => {
      if (!cancelled) setState({ streamId, joins: uniqueStreamJoins(pending) });
    }).finally(() => { loaded = true; });
    return () => { cancelled = true; subscription?.leave(); };
  }, [streamId, offline]);
  return state.streamId === streamId ? state.joins : [];
}
