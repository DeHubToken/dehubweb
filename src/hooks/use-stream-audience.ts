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
 * Its own file rather than a second export of use-stream-presence: that one is
 * imported by LiveStreamCard, which is on the boot path, so anything added to
 * it is downloaded before first paint. Only lazy surfaces import this, and both
 * the API module and the socket are reached through `await import` for the same
 * reason (scripts/boot-path-report.mjs).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * How often the figure is re-read from the API.
 *
 * The socket carries every change, so this is only the seed and the safety net
 * for a dropped event — glanceable, not a ticker.
 */
const AUDIENCE_POLL_MS = 30_000;

export function useStreamAudience(streamId: string | undefined, enabled = true): number | null {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const active = !!streamId && enabled;

  // Seeded from the same field the host console reads, so the number is right
  // on first paint rather than at the next join — the gateway only broadcasts
  // on change, so without this a viewer arriving mid-stream sits on a stale
  // zero until somebody else comes or goes.
  const { data } = useQuery({
    queryKey: ['stream-audience', streamId],
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
        // Watch, never join: `stream.join` adds a viewer row, bumps totalViews
        // and moves peakViewers, so a host opening their own console would
        // inflate the very number they are reading.
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
