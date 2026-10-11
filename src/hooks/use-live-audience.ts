import { useQuery } from '@tanstack/react-query';
import { getStreamAudience, type LiveAudience } from '@/lib/api/dehub/livestream';

/**
 * Who is in a live room: host, watchers, top tippers, most active chatters.
 * Faster while the sheet is open, slow while it only feeds the faces pill.
 * The app's hooks/useLiveAudience.ts is the twin of this.
 */
export function useLiveAudience(streamId: string | null | undefined, opts: { open?: boolean; enabled?: boolean } = {}) {
  const enabled = !!streamId && opts.enabled !== false;
  return useQuery<LiveAudience>({
    queryKey: ['live-audience', streamId],
    queryFn: () => getStreamAudience(String(streamId)),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? (opts.open ? 8_000 : 30_000) : false,
  });
}
