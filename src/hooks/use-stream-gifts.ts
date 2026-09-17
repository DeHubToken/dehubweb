/**
 * Play a gift celebration for everyone watching a stream, not just the sender.
 *
 * Loads the socket client on demand for the same reason use-stream-presence
 * does: LiveStreamCard sits in the post page's static import graph, and a
 * static socket.io-client here would drag the transport onto the boot path
 * (scripts/check-entry-bundle.mjs).
 */
import { useEffect, useRef } from 'react';
import type { StreamGiftBroadcast } from '@/lib/api/dehub/stream-presence';

export function useStreamGifts(
  streamId: string | undefined | null,
  enabled: boolean,
  onGift: (gift: StreamGiftBroadcast) => void,
) {
  // Callers pass an inline closure. Re-subscribing the socket on every render
  // of a live card would churn the room join, so the handler is read through a
  // ref and the subscription keys only on the stream.
  const handler = useRef(onGift);
  useEffect(() => {
    handler.current = onGift;
  }, [onGift]);

  useEffect(() => {
    if (!streamId || !enabled) return;

    let cancelled = false;
    let sub: { leave: () => void } | null = null;

    import('@/lib/api/dehub/stream-presence')
      .then(({ watchStreamGifts }) => {
        // The card may have unmounted while the chunk was in flight; the
        // cleanup below has already run by then.
        if (cancelled) return;
        sub = watchStreamGifts(streamId, (gift) => {
          if (!cancelled) handler.current(gift);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId, enabled]);
}
