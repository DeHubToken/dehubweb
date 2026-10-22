import { useQuery } from '@tanstack/react-query';
import type { PublicOverlay } from '@/lib/live-overlay/types';

export const streamOverlayKey = (streamId: string | null | undefined) => ['stream-overlay', streamId] as const;

/**
 * The creator's overlay for a stream. Refetched when they save (the layer
 * invalidates the key), never polled. The API loads inside the query because
 * the live card is on the boot path.
 */
export function useStreamOverlay(streamId: string | null | undefined, enabled: boolean) {
  return useQuery<PublicOverlay>({
    queryKey: streamOverlayKey(streamId),
    queryFn: async () => (await import('@/lib/api/dehub/live-overlay')).getStreamOverlay(String(streamId)),
    enabled: !!streamId && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
