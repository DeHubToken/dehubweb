import { useEffect, useState } from 'react';
import { getStreamActivities, type StreamActivity } from '@/lib/api/dehub/livestream';
import { watchStreamGifts, watchStreamJoins } from '@/lib/api/dehub/stream-presence';

/**
 * Keep the FIRST arrival per identified viewer; reconnects are not new people.
 * The socket re-emits a join on every reconnect, and keeping the latest copy
 * moved a viewer's arrival below the tip they had already sent. Anything that
 * is not a join (a gift) passes through untouched, in time order.
 */
export function uniqueStreamJoins(joins: StreamActivity[]): StreamActivity[] {
  const seen = new Set<string>();
  const ids = new Set<string>();
  return [...joins].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).filter((moment) => {
    // A gift can reach the socket twice (the gateway's broadcast and the
    // sender's own echo) under the same tx hash.
    if (ids.has(moment.id)) return false;
    ids.add(moment.id);
    if (moment.type !== 'join') return true;
    const address = moment.address?.toLowerCase();
    if (!address) return true;
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

const isMoment = (a: StreamActivity) => a.type === 'join' || a.type === 'gift';

/** The same event, seen once in the initial request and once from the socket. */
function alreadyRecorded(history: StreamActivity[], event: StreamActivity): boolean {
  return history.some((a) => {
    if (a.type !== event.type) return false;
    return a.address.toLowerCase() === event.address.toLowerCase() &&
      Math.abs(Date.parse(a.timestamp) - Date.parse(event.timestamp)) < 2000;
  });
}

/**
 * Seed the recorded arrivals and gifts, then append every one that lands while
 * this chat is open. Gifts ride here too: the app has always shown a tip as a
 * line in the chat, and the web chat showed only the joins around it.
 */
export function useStreamChatJoins(streamId?: string, offline = false) {
  const [state, setState] = useState<{ streamId?: string; joins: StreamActivity[] }>({ joins: [] });
  useEffect(() => {
    setState({ streamId, joins: [] });
    if (!streamId) return;
    let cancelled = false;
    let sequence = 0;
    const pending: StreamActivity[] = [];
    let loaded = false;
    const push = (event: StreamActivity) => {
      if (!loaded) pending.push(event);
      else setState((prev) => ({ streamId, joins: uniqueStreamJoins([...prev.joins, event]).slice(-300) }));
    };
    const joins = offline ? null : watchStreamJoins(streamId, (user) => {
      push({
        id: `arrival:${streamId}:${++sequence}`,
        type: 'join', address: user.address || '',
        username: user.displayName || user.username,
        avatarUrl: user.avatarImageUrl || undefined,
        timestamp: new Date().toISOString(),
      });
    });
    const gifts = offline ? null : watchStreamGifts(streamId, (gift) => {
      push({
        id: gift.transactionHash ? `gift:${gift.transactionHash}` : `gift:${streamId}:${++sequence}`,
        type: 'gift', address: gift.address || '',
        username: gift.username,
        message: gift.message,
        giftAmount: gift.amount,
        giftCurrency: 'DHB',
        timestamp: new Date().toISOString(),
      });
    });
    getStreamActivities(streamId, { unit: 200 }).then(({ result }) => {
      if (cancelled) return;
      const history = result.filter(isMoment);
      const fresh = pending.filter((event) => !alreadyRecorded(history, event));
      setState({ streamId, joins: uniqueStreamJoins([...history, ...fresh]) });
    }).catch(() => {
      if (!cancelled) setState({ streamId, joins: uniqueStreamJoins(pending) });
    }).finally(() => { loaded = true; });
    return () => { cancelled = true; joins?.leave(); gifts?.leave(); };
  }, [streamId, offline]);
  return state.streamId === streamId ? state.joins : [];
}
