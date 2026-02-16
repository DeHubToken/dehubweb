/**
 * Vote Cache
 * ==========
 * Global in-memory store for recent votes so optimistic UI
 * survives page navigations (new component mounts).
 * Entries auto-expire after 30 seconds.
 *
 * Also exposes `patchFeedCaches` which patches React Query infinite
 * query caches in-place so that hidden (overlay-pattern) feed
 * components receive updated props without remounting.
 */

import type { QueryClient, InfiniteData } from '@tanstack/react-query';

interface VoteCacheEntry {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
  timestamp: number;
}

const cache = new Map<string, VoteCacheEntry>();
const TTL = 30_000; // 30 seconds

export function setVoteCache(
  postId: string,
  state: Omit<VoteCacheEntry, 'timestamp'>,
): void {
  cache.set(postId, { ...state, timestamp: Date.now() });
}

export function getVoteCache(postId: string): Omit<VoteCacheEntry, 'timestamp'> | null {
  const entry = cache.get(postId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(postId);
    return null;
  }
  const { timestamp: _, ...state } = entry;
  return state;
}

export function clearVoteCache(postId: string): void {
  cache.delete(postId);
}

// ---------------------------------------------------------------------------
// Feed-cache patching
// ---------------------------------------------------------------------------

/** Query key prefixes that hold paginated feed data with vote-able items */
const FEED_KEYS: string[] = [
  'unified-feed',
  'dehub-videos',
  'dehub-images',
  'profile-content',
];

interface VoteState {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
}

/**
 * Walk every page of every cached infinite query that matches our known feed
 * keys and patch the item whose `id` === `postId` with the new vote state.
 *
 * This keeps hidden (overlay-pattern) feed components in sync without
 * requiring a remount or refetch.
 */
export function patchFeedCaches(
  queryClient: QueryClient,
  postId: string,
  voteState: VoteState,
): void {
  for (const key of FEED_KEYS) {
    queryClient.setQueriesData<InfiniteData<{ items: any[] }>>(
      { queryKey: [key] },
      (oldData) => {
        if (!oldData?.pages) return oldData;

        let changed = false;
        const newPages = oldData.pages.map((page) => {
          if (!page?.items) return page;
          const newItems = page.items.map((item: any) => {
            if (String(item.id) !== String(postId)) return item;
            changed = true;

            // Clone & patch – handles all feed item shapes
            const patched = { ...item, isLiked: voteState.isLiked, isDisliked: voteState.isDisliked };

            // VideoItem shape
            if ('likeCount' in item) patched.likeCount = voteState.likeCount;
            if ('dislikeCount' in item) patched.dislikeCount = voteState.dislikeCount;

            // ImagePost shape (likes field)
            if ('likes' in item && typeof item.likes === 'number') patched.likes = voteState.likeCount;

            // TextPost shape (stats.likes)
            if (item.stats && typeof item.stats.likes === 'number') {
              patched.stats = { ...item.stats, likes: voteState.likeCount };
            }

            return patched;
          });
          return { ...page, items: newItems };
        });

        return changed ? { ...oldData, pages: newPages } : oldData;
      },
    );
  }
}
