/**
 * Check if a stream tokenId is marked live in Supabase.
 * Used when api.dehub.io /start fails - we store live status in our table.
 *
 * The row alone is not the answer. It has no TTL and nothing deletes it when a
 * broadcast dies without running its teardown — a crashed tab, a killed
 * browser, a closed laptop — so a post kept claiming to be LIVE forever over a
 * player that could never load, while the Live feed (which reads the backend)
 * showed the same stream as ended. The broadcaster now touches `heartbeat_at`
 * once a minute while it is on air, so a stream that stopped breathing stops
 * reading as live.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * How stale a pulse may get before the stream is treated as gone.
 *
 * Generously wider than the one-minute beat: a backgrounded tab throttles its
 * timers, and a phone that slept for ninety seconds is still streaming. The
 * cost of waiting is a card that reads live a little longer; the cost of being
 * impatient is cutting off a broadcast that is still running.
 */
const HEARTBEAT_GRACE_MS = 4 * 60 * 1000;

export function useStreamLiveStatus(tokenId: string | null) {
  return useQuery({
    queryKey: ['stream-live-status', tokenId],
    queryFn: async () => {
      if (!tokenId) return false;
      const { data, error } = await (supabase as any)
        .from('live_stream_sessions')
        .select('token_id, heartbeat_at, started_at')
        .eq('token_id', String(tokenId))
        .maybeSingle();
      if (error || !data) return false;

      // Rows written before the heartbeat column existed carry no pulse of
      // their own; fall back to when they started rather than trusting them
      // indefinitely.
      const pulse = data.heartbeat_at ?? data.started_at;
      if (!pulse) return false;

      return Date.now() - new Date(pulse).getTime() < HEARTBEAT_GRACE_MS;
    },
    enabled: !!tokenId,
    staleTime: 30 * 1000,
    // A stream that goes quiet has to stop reading as live on its own, without
    // the viewer reloading the page.
    refetchInterval: 60 * 1000,
  });
}
