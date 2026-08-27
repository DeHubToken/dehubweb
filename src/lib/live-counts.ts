/**
 * Live engagement counts
 * ======================
 * Folds fresh counts into feed pages the reader is already looking at,
 * without touching the list itself.
 *
 * Kept out of use-unified-feed so it carries no React or auth imports: this is
 * cache surgery, and it is the piece worth testing on its own.
 *
 * @module lib/live-counts
 */

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { applyVoteStateToNFT } from '@/lib/engagement';
import { getVoteCache } from '@/lib/vote-cache';

/** A raw /api/feed row, as cached in a unified-feed page's `items`. */
export type RawFeedRow = Record<string, unknown> & { tokenId?: number | string };

/**
 * The only fields a background refresh may overwrite on a card already on
 * screen. Order, media, quoted posts and the viewer's own flags are left
 * exactly as the reader found them.
 */
const LIVE_COUNT_FIELDS = [
  'totalViews',
  'views',
  'totalVotes',
  'reactionCounts',
  'likes',
  'dislikes',
  'commentCount',
  'totalTips',
  'totalReposts',
  'reposts',
  'quotes',
] as const;

/** Counts are numbers or small flat objects (`totalVotes`, `reactionCounts`). */
function sameCount(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Fold fresh engagement counts into every cached feed page, leaving the list
 * itself untouched.
 *
 * Counts are the part of a feed item that goes out of date while the reader is
 * looking at it. Refetching the list to pick them up would reorder and re-slice
 * the timeline underneath them — which is exactly why the list query never
 * refetches on focus. Patching count fields alone keeps the numbers honest and
 * the reader's place intact.
 *
 * EVERY `['unified-feed', …]` variant is patched, not just the one polled: the
 * same post is routinely cached by home, explore and a profile tab at once, and
 * a count is a count on all of them.
 *
 * An optimistic vote still inside the 5-minute vote cache is re-applied on top.
 * The polled row can predate the reader's own like, and snapping their own
 * button back is worse than a count that lags a minute.
 */
export function mergeLiveCounts(queryClient: QueryClient, rows: readonly RawFeedRow[]): void {
  if (!rows?.length) return;

  const fresh = new Map<string, RawFeedRow>();
  for (const row of rows) {
    if (row?.tokenId === undefined || row.tokenId === null) continue;
    fresh.set(String(row.tokenId), row);
  }
  if (!fresh.size) return;

  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['unified-feed'] })) {
    const data = query.state.data as InfiniteData<{ items?: RawFeedRow[] }> | undefined;
    if (!data?.pages?.length) continue;

    let changed = false;
    const pages = data.pages.map((page) => {
      if (!Array.isArray(page?.items)) return page;

      let pageChanged = false;
      // `any` deliberately: a cached page holds raw API objects, not one of the
      // mapped card types, and this walks them by field name.
      const items = (page.items as any[]).map((item: any) => {
        const row = item?.tokenId === undefined ? undefined : fresh.get(String(item.tokenId));
        if (!row) return item;

        const patch: Record<string, unknown> = {};
        for (const field of LIVE_COUNT_FIELDS) {
          if (!(field in row)) continue;
          if (sameCount(item[field], row[field])) continue;
          patch[field] = row[field];
        }
        // Nothing moved — hand back the same object so the card's memos hold.
        if (!Object.keys(patch).length) return item;

        pageChanged = true;
        const merged = { ...item, ...patch };
        const pendingVote = getVoteCache(String(item.tokenId));
        return pendingVote ? applyVoteStateToNFT(merged, pendingVote) : merged;
      });

      if (!pageChanged) return page;
      changed = true;
      return { ...page, items };
    });

    if (!changed) continue;

    // Keep the entry's own freshness stamp. This is a count patch, not a
    // refetch: letting it look like one would persuade refetchOnMount that the
    // list is current and suppress the next real revalidation.
    queryClient.setQueryData(query.queryKey, { ...data, pages }, { updatedAt: query.state.dataUpdatedAt });
  }
}

