/**
 * Everything happening in a stream's room, for its overlay.
 *
 * Loads the socket client on demand, like use-stream-gifts: the live card is on
 * the post page's static import graph, and a static socket.io-client here would
 * drag the transport onto the boot path (scripts/check-entry-bundle.mjs).
 */
import { useEffect, useRef } from 'react';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';

export function useLiveRoomEvents(
  streamId: string | undefined | null,
  enabled: boolean,
  onEvent: (event: LiveRoomEvent) => void,
) {
  // Read through a ref so an inline handler does not re-join the room on every
  // render of the card.
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!streamId || !enabled) return;

    let cancelled = false;
    let sub: { leave: () => void } | null = null;

    import('@/lib/api/dehub/stream-presence')
      .then(({ watchLiveRoomEvents }) => {
        if (cancelled) return;
        sub = watchLiveRoomEvents(streamId, (event) => {
          if (!cancelled) handler.current(event);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId, enabled]);
}
