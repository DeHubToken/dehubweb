/**
 * Count this tab as a viewer of a live stream, and read the count back.
 *
 * Loads the socket client on demand — LiveStreamCard is reached from the post
 * page's static import graph, and a static socket.io-client here would put the
 * whole transport on the boot path (scripts/check-entry-bundle.mjs).
 */
import { useEffect, useState } from 'react';

export function useStreamPresence(streamId: string | undefined, isLive: boolean): number | null {
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  useEffect(() => {
    if (!streamId || !isLive) {
      setViewerCount(null);
      return;
    }

    let cancelled = false;
    let presence: { leave: () => void } | null = null;

    import('@/lib/api/dehub/stream-presence')
      .then(({ joinStreamPresence }) => {
        // The effect may have been torn down while the chunk was fetching; the
        // cleanup below has already run by then, so joining now would leave a
        // viewer counted for a card nobody is looking at.
        if (cancelled) return;
        presence = joinStreamPresence(streamId, (count) => {
          if (!cancelled) setViewerCount(count);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      presence?.leave();
    };
  }, [streamId, isLive]);

  return viewerCount;
}
