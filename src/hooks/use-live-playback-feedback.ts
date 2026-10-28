import { useEffect, useState } from 'react';

/** A stopped broadcast has a state, not an unbounded loading animation. */
export function useLivePlaybackFeedback(streamId: string | undefined, loading: boolean, enabled = true, initialStatus?: string) {
  const [broadcastPaused, setBroadcastPaused] = useState(initialStatus?.toUpperCase() === 'PAUSED');
  const [broadcastEnded, setBroadcastEnded] = useState(false);
  const [waitingTooLong, setWaitingTooLong] = useState(false);
  useEffect(() => setBroadcastPaused(initialStatus?.toUpperCase() === 'PAUSED'), [streamId, initialStatus]);
  useEffect(() => setBroadcastEnded(false), [streamId]);
  useEffect(() => {
    if (!streamId || !enabled) return;
    let cancelled = false;
    let subscription: { leave: () => void } | undefined;
    const ended = () => { setBroadcastPaused(false); setBroadcastEnded(true); };
    void import('@/lib/api/dehub/stream-presence').then(({ watchStreamPlayback }) => {
      if (!cancelled) subscription = watchStreamPlayback(streamId, setBroadcastPaused, ended);
    }).catch(() => undefined);
    return () => { cancelled = true; subscription?.leave(); };
  }, [streamId, enabled]);
  useEffect(() => {
    setWaitingTooLong(false);
    if (!enabled || !loading || broadcastPaused || broadcastEnded) return;
    const timer = setTimeout(() => setWaitingTooLong(true), 12_000);
    return () => clearTimeout(timer);
  }, [enabled, loading, broadcastPaused, broadcastEnded, streamId]);
  return { broadcastPaused, broadcastEnded, waitingTooLong };
}
