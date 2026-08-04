/**
 * Per-comment tip totals for a post's comment section.
 *
 * One Supabase query per loaded comment set (not per comment): all tips for
 * the visible comment ids come back in a single `.in()` call and are grouped
 * client-side into a Record<commentId, DHB>. Comment tips are the
 * tip_records rows carrying a comment_id — the same rows use-post-tip-count
 * deliberately excludes from the post's own counter.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCommentTips(tokenId: string, commentIds: string[]) {
  return useQuery({
    // The id-set length keys pagination: loading another page must refetch.
    // TipModal invalidates the ['comment-tips', tokenId] prefix after a
    // confirmed tip, which catches every length variant.
    queryKey: ['comment-tips', tokenId, commentIds.length],
    queryFn: async (): Promise<Record<string, number>> => {
      // comment_id postdates the generated Supabase types, so the cast must
      // happen at the builder — letting the typed client parse this select
      // string sends its type-level parser into TS2589 recursion. The insert
      // side (use-tip-payment) casts for the same reason.
      const { data, error } = await (supabase.from('tip_records') as any)
        .select('comment_id, amount')
        .in('comment_id', commentIds);

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        comment_id: string | null;
        amount: number;
      }>;

      const totals: Record<string, number> = {};
      for (const r of rows) {
        if (!r.comment_id) continue;
        totals[r.comment_id] = (totals[r.comment_id] || 0) + Number(r.amount);
      }
      return totals;
    },
    enabled: commentIds.length > 0,
    staleTime: 60_000,
  });
}
