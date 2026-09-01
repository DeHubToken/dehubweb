/**
 * Count this tab as a viewer of a live stream, and read the count back.
 *
 * Loads the socket client on demand — LiveStreamCard is reached from the post
 * page's static import graph, and a static socket.io-client here would put the
 * whole transport on the boot path (scripts/check-entry-bundle.mjs).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * How often the audience figure is re-read from the API.
 *
 * The socket carries every change, so this is only the seed and the safety net
 * for a dropped event — glanceable, not a ticker.
 */
const AUDIENCE_POLL_MS = 30_000;

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

/**
 * How many people are watching a stream right now, without joining it.
 *
 * Two numbers used to sit on the same live screen claiming to be this. The
 * host's console showed the real per-stream figure; the chat panel beside it
 * showed `useLiveChatPresence`, which ignores the room it is handed and returns
 * `GET /api/livechat/online` — the count of everybody connected to the ONE
 * global platform chat. On 2026-09-01 a host read "0 watching" over a chat
 * saying three and concluded the stream was broken. Nothing was broken: three
 * people were in the platform chat and nobody was watching.
 *
 * This is the honest figure, and every surface on a live screen now reads it
 * from here so they cannot disagree again.
 *
 * `watchStreamPresence` subscribes without emitting `stream.join`, so a viewer
 * who merely reads the number is never counted as one — that matters most for
 * the host, who would otherwise be an audience member of their own broadcast.
 * The gateway only broadcasts on change, so the poll below supplies the value
 * before the next person joins or leaves; without it a viewer arriving mid-
 * stream sits on a stale zero until somebody else moves.
 */
export function useStreamAudience(streamId: string | undefined, enabled = true): number | null {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const active = !!streamId && enabled;

  // Seeded from the same field the host console reads, so the number is right
  // on first paint rather than at the next join.
  const { data } = useQuery({
    queryKey: ['stream-audience', streamId],
    // Dynamically imported for the same reason the socket below is: this file
    // sits in the post page's static graph, and a static import here drags the
    // livestream API module — and everything it reaches — onto the boot path
    // (scripts/boot-path-report.mjs).
    queryFn: () =>
      import('@/lib/api/dehub/livestream').then((m) => m.getLiveStream(streamId as string)),
    enabled: active,
    refetchInterval: AUDIENCE_POLL_MS,
    staleTime: AUDIENCE_POLL_MS,
  });
  const polled = (data?.result as { viewerCount?: number } | undefined)?.viewerCount;

  useEffect(() => {
    if (!active) {
      setLiveCount(null);
      return;
    }

    let cancelled = false;
    let presence: { leave: () => void } | null = null;

    import('@/lib/api/dehub/stream-presence')
      .then(({ watchStreamPresence }) => {
        if (cancelled) return;
        presence = watchStreamPresence(streamId as string, (count) => {
          if (!cancelled) setLiveCount(count);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      presence?.leave();
    };
  }, [streamId, active]);

  if (!active) return null;
  return liveCount ?? (typeof polled === 'number' ? polled : null);
}
