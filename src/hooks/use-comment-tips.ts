/**
 * Per-comment tip totals for a post's comment section.
 *
 * One Supabase query per POST, not per comment and not per loaded page: every
 * comment tip on the thread comes back in a single call keyed on `token_id`
 * and is grouped client-side into a Record<commentId, DHB>. Comment tips are
 * the tip_records rows carrying a comment_id — the same rows
 * use-post-tip-count deliberately excludes from the post's own counter.
 *
 * Token-wide rather than "the ids currently on screen", because the answer is
 * also what decides the order: the five best-tipped comments lead the thread,
 * and a query scoped to the loaded window could only ever rank the window. The
 * ids come back as `topTippedIds` and are handed to the comments API, which
 * floats them onto page 0.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** How many tipped comments lead the thread, under the creator's pin. */
export const TOP_TIPPED_COUNT = 5;

export interface CommentTips {
  /** commentId → DHB tipped to it, across the whole thread. */
  totals: Record<string, number>;
  /** The best-tipped comment ids, most first, capped at TOP_TIPPED_COUNT. */
  topTippedIds: string[];
}

const EMPTY: CommentTips = { totals: {}, topTippedIds: [] };

export function useCommentTips(tokenId: string) {
  const query = useQuery({
    // No page or id-set in the key: the query covers the whole thread, so
    // loading another page must NOT refetch it. TipModal invalidates
    // ['comment-tips', tokenId] after a confirmed tip.
    queryKey: ['comment-tips', tokenId],
    queryFn: async (): Promise<CommentTips> => {
      // comment_id postdates the generated Supabase types, so the cast must
      // happen at the builder — letting the typed client parse this select
      // string sends its type-level parser into TS2589 recursion. The insert
      // side (use-tip-payment) casts for the same reason.
      const { data, error } = await (supabase.from('tip_records') as any)
        .select('comment_id, amount')
        .eq('token_id', tokenId)
        .not('comment_id', 'is', null);

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

      const topTippedIds = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_TIPPED_COUNT)
        .map(([id]) => id);

      return { totals, topTippedIds };
    },
    enabled: Boolean(tokenId),
    staleTime: 60_000,
  });

  // Never undefined: both consumers read it on every render, and the tip rank
  // has to resolve to "nothing is tipped" rather than "unknown" while the
  // query is in flight — otherwise the list would hold its order back waiting
  // on a figure most threads do not have.
  return { ...query, data: query.data ?? EMPTY };
}
