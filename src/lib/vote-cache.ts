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
import { applyVoteStateToNFT, type VoteState } from '@/lib/engagement';
import type { PostReaction, ReactionCounts } from '@/lib/reactions';

interface VoteCacheEntry {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
  /** The viewer's reaction. Optional so plain like/dislike callers are unchanged. */
  myReaction?: PostReaction | null;
  reactionCounts?: ReactionCounts;
  timestamp: number;
}

const cache = new Map<string, VoteCacheEntry>();
const TTL = 300_000; // 5 minutes — must outlast feed staleTime (2min) to prevent stale props from reverting optimistic votes

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

export function clearAllVoteCaches(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Feed-cache patching
// ---------------------------------------------------------------------------

/** Query key prefixes that hold paginated feed data with vote-able items.
 * NOTE: 'dehub-feed' is the real key family behind the Shorts/Images/Live
 * tabs (use-dehub-feed.ts) — the old 'dehub-videos'/'dehub-images' names
 * matched no query and silently patched nothing. Its pages carry `data`
 * instead of `items`; the walker below handles both.
 * Same story for 'dehub-user-content' (use-dehub-profile.ts), which powers the
 * profile tabs: it was listed here as 'profile-content', a key no query has
 * ever used, so a vote cast on a profile never reached the home feed's cache
 * and vice versa. */
const FEED_KEYS: string[] = [
  'unified-feed',
  'dehub-feed',
  'dehub-user-content',
];

export type { VoteState };

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
    queryClient.setQueriesData<InfiniteData<{ items?: any[]; data?: any[] }>>(
      { queryKey: [key] },
      (oldData) => {
        if (!oldData?.pages) return oldData;

        let changed = false;
        const newPages = oldData.pages.map((page) => {
          // unified-feed pages use `items`; dehub-feed pages use `data`
          const listKey = page?.items ? 'items' : page?.data ? 'data' : null;
          if (!listKey) return page;
          const newItems = (page[listKey] as any[]).map((item: any) => {
            const itemId = String(item.id ?? item.tokenId ?? '');
            if (itemId !== String(postId)) return item;
            changed = true;

            // Raw API item (unified-feed pages, and the dehub-feed /
            // dehub-user-content pages, hold unmapped NFTs): counts live in
            // `totalVotes`, which applyVoteStateToNFT always writes. It has to
            // CREATE that object when absent — the API omits it entirely on a
            // post nobody has liked yet, so the old `if (item.totalVotes)`
            // guard dropped the first like of every such post on the floor.
            // The optimistic count then existed only in ActionBar's local
            // state, and the post's own page — seeded from this very item —
            // opened showing 0 likes.
            if (item.tokenId !== undefined && item.type === undefined) {
              return applyVoteStateToNFT(item, voteState);
            }

            // Mapped card shapes (VideoItem / ImagePost / TextPost)
            const patched = { ...item, isLiked: voteState.isLiked, isDisliked: voteState.isDisliked };
            if ('myReaction' in voteState) patched.myReaction = voteState.myReaction ?? null;
            if (voteState.reactionCounts) patched.reactionCounts = voteState.reactionCounts;

            // VideoItem shape
            if ('likeCount' in item) patched.likeCount = voteState.likeCount;
            if ('dislikeCount' in item) patched.dislikeCount = voteState.dislikeCount;

            // ImagePost shape (likes field)
            if ('likes' in item && typeof item.likes === 'number') patched.likes = voteState.likeCount;

            // Raw API item shape (dehub-feed / dehub-user-content pages hold
            // unmapped NFTs, whose counts live under totalVotes)
            if (item.totalVotes) {
              patched.totalVotes = { ...item.totalVotes, for: voteState.likeCount, against: voteState.dislikeCount };
            }

            // TextPost shape (stats.likes)
            if (item.stats && typeof item.stats.likes === 'number') {
              patched.stats = { ...item.stats, likes: voteState.likeCount };
            }

            return patched;
          });
          return { ...page, [listKey]: newItems };
        });

        return changed ? { ...oldData, pages: newPages } : oldData;
      },
    );
  }
}
