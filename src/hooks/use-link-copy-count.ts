/**
 * Post link-copy tracking
 * =======================
 * Counts "copy link" shares per post via the `post_link_copies` Supabase
 * table (see supabase/migrations/20260716120000_post_link_copies.sql).
 * The shorts share button shows reposts + link copies as its counter.
 *
 * Both helpers degrade silently to 0 / no-op if the migration hasn't been
 * applied yet (PGRST202), so shipping the frontend first is safe.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Aggregate link-copy count for one post. Returns 0 until data exists. */
export function usePostLinkCopyCount(tokenId?: string) {
  return useQuery({
    queryKey: ['post-link-copies', tokenId],
    queryFn: async () => {
      const id = parseInt(tokenId!, 10);
      if (isNaN(id)) return 0;
      const { data, error } = await (supabase.rpc as any)('get_post_link_copy_counts', {
        p_token_ids: [id],
      });
      if (error) return 0;
      return Number(data?.[0]?.copies ?? 0);
    },
    enabled: !!tokenId,
    staleTime: 60_000,
  });
}

/** Fire-and-forget: record that the current user copied this post's link. */
export function trackPostLinkCopy(tokenId?: string, walletAddress?: string | null) {
  if (!tokenId) return;
  const id = parseInt(tokenId, 10);
  if (isNaN(id)) return;
  (supabase.rpc as any)('track_post_link_copy', {
    p_token_id: id,
    p_wallet: walletAddress?.toLowerCase() ?? null,
  }).then(() => {}, () => {});
}
