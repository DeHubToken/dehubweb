import type { InfiniteData } from '@tanstack/react-query';

/**
 * Dropping one author's posts out of the cached feeds, in place.
 *
 * Shared by `use-mute-author` and `use-block-author`: both hide an account, and
 * both must do it without refetching. Refetching the unified feed tears down
 * the infinite-scroll list and snaps the reader back to the top, so the post
 * has to disappear where it sits instead.
 *
 * @module lib/feed-prune
 */

export const lowerAddress = (value?: string | null) => (value ?? '').toLowerCase();

/** Structural subset of UnifiedFeedItem — only what pruning needs. */
interface PruneableUnifiedItem {
  minter?: string;
}

/** Structural subset of a dehub-feed page ({ data: DeHubNFT[] }). */
interface PruneableNftItem {
  minter?: string;
  creator?: { id?: string };
}

export function pruneUnifiedPages(
  data: InfiniteData<{ items?: PruneableUnifiedItem[] }> | undefined,
  address: string,
) {
  if (!data?.pages) return data;
  return {
    ...data,
    pages: data.pages.map((page) => {
      const items = page?.items;
      if (!Array.isArray(items)) return page;
      return { ...page, items: items.filter((item) => lowerAddress(item.minter) !== address) };
    }),
  };
}

export function pruneNftPages(
  data: InfiniteData<{ data?: PruneableNftItem[] }> | undefined,
  address: string,
) {
  if (!data?.pages) return data;
  return {
    ...data,
    pages: data.pages.map((page) => {
      const items = page?.data;
      if (!Array.isArray(items)) return page;
      return {
        ...page,
        data: items.filter(
          (item) =>
            lowerAddress(item.minter) !== address && lowerAddress(item.creator?.id) !== address,
        ),
      };
    }),
  };
}
