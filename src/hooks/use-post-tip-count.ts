/**
 * Hook to fetch tip count for a specific post from tip_records.
 *
 * Fetches are COALESCED: every card on a feed page used to fire its own
 * Supabase REST call (20+ per page). Requests arriving within one 50ms tick
 * are merged into a single `.in('token_id', ids)` query, then fanned back out.
 * The cache stays per-token (['post-tip-count', tokenId]) so TipModal's
 * optimistic patch + targeted invalidation keep working unchanged.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const pendingResolvers = new Map<string, Array<(total: number) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushTipCountBatch() {
  flushTimer = null;
  const batch = new Map(pendingResolvers);
  pendingResolvers.clear();
  if (batch.size === 0) return;

  const ids = [...batch.keys()];
  supabase
    .from('tip_records')
    .select('token_id, amount')
    .in('token_id', ids)
    .then(({ data, error }) => {
      const sums = new Map<string, number>();
      if (error) {
        console.warn('[TipCount] Batch query error:', error);
      } else {
        for (const r of data || []) {
          const key = String(r.token_id);
          sums.set(key, (sums.get(key) || 0) + Number(r.amount));
        }
      }
      batch.forEach((resolvers, id) => {
        const total = sums.get(id) || 0;
        resolvers.forEach(resolve => resolve(total));
      });
    });
}

function requestTipCount(tokenId: string): Promise<number> {
  return new Promise(resolve => {
    const resolvers = pendingResolvers.get(tokenId) ?? [];
    resolvers.push(resolve);
    pendingResolvers.set(tokenId, resolvers);
    if (!flushTimer) flushTimer = setTimeout(flushTipCountBatch, 50);
  });
}

export function usePostTipCount(tokenId?: string) {
  return useQuery({
    queryKey: ['post-tip-count', tokenId],
    queryFn: () => requestTipCount(tokenId!),
    enabled: !!tokenId,
    // Tips change rarely; the tipped post's own count is patched optimistically
    // and invalidated by TipModal, so a long staleTime costs no freshness.
    staleTime: 5 * 60_000,
  });
}
