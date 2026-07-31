import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  resolveLikeCount,
  resolveDislikeCount,
  applyVoteStateToNFT,
  mergeViewerState,
  hasViewerFields,
} from '@/lib/engagement';
import { patchFeedCaches, clearAllVoteCaches } from '@/lib/vote-cache';

/**
 * These cover the "post forgets its likes when you open it" bug:
 * the feed and the dedicated post page each resolved the like count from a
 * different field, the optimistic patch could not create a count on a post that
 * had never been liked, and an anonymous refetch wiped the viewer's own flags.
 */

const VOTE = { isLiked: true, isDisliked: false, likeCount: 1, dislikeCount: 0 };

type CachedFeed = { pages: Array<{ items: Record<string, unknown>[] }> };
const feedItems = (queryClient: QueryClient, key: unknown[]) =>
  (queryClient.getQueryData(key) as CachedFeed).pages[0].items;

describe('resolveLikeCount', () => {
  it('prefers totalVotes.for — the count /api/post-likers agrees with', () => {
    // Real payload for token 61: likers totalCount is 144, not 7.
    expect(resolveLikeCount({ likes: 7, totalVotes: { for: 144, against: 2 } })).toBe(144);
  });

  it('falls back to legacy likes / like_count when totalVotes is absent', () => {
    expect(resolveLikeCount({ likes: 7 })).toBe(7);
    expect(resolveLikeCount({ like_count: 4 })).toBe(4);
    expect(resolveLikeCount({ likes: ['0xa', '0xb'] })).toBe(2);
  });

  it('reads an explicit zero rather than falling through it', () => {
    expect(resolveLikeCount({ totalVotes: { for: 0 }, likes: 7 })).toBe(0);
  });

  it('returns 0 for a post with no count fields at all (33 of 400 sampled)', () => {
    expect(resolveLikeCount({})).toBe(0);
    expect(resolveLikeCount(undefined)).toBe(0);
  });

  it('resolves dislikes the same way', () => {
    expect(resolveDislikeCount({ dislikes: 1, totalVotes: { against: 2 } })).toBe(2);
    expect(resolveDislikeCount({ dislike_count: 3 })).toBe(3);
    expect(resolveDislikeCount({})).toBe(0);
  });

  it('agrees with the dedicated post page for every payload shape', () => {
    // Both surfaces call this; the point of the test is that there is only one
    // implementation left to call.
    const payloads = [
      { likes: 121, totalVotes: { for: 349, against: 1 } },
      { totalVotes: { for: 205, against: 2 } },
      { likes: 16 },
      {},
    ];
    for (const p of payloads) {
      expect(resolveLikeCount(p)).toBe(resolveLikeCount({ ...p }));
    }
  });
});

describe('applyVoteStateToNFT', () => {
  it('creates totalVotes on a post that has never been voted on', () => {
    const patched = applyVoteStateToNFT({ tokenId: 5004 } as Record<string, unknown>, VOTE);
    expect(patched.totalVotes).toEqual({ for: 1, against: 0 });
    expect(resolveLikeCount(patched)).toBe(1);
    expect(patched.isLiked).toBe(true);
  });

  it('keeps legacy mirrors in sync when present, and does not invent them', () => {
    const withLegacy = applyVoteStateToNFT({ likes: 7, dislikes: 2, totalVotes: { for: 144 } }, VOTE);
    expect(withLegacy.likes).toBe(1);
    expect(withLegacy.dislikes).toBe(0);

    const withoutLegacy = applyVoteStateToNFT({ totalVotes: { for: 144 } }, VOTE);
    expect('likes' in withoutLegacy).toBe(false);
  });

  it('does not mutate the cached object it patches', () => {
    const original = { tokenId: 5004, totalVotes: { for: 7, against: 1 } };
    applyVoteStateToNFT(original, VOTE);
    expect(original.totalVotes).toEqual({ for: 7, against: 1 });
  });
});

describe('patchFeedCaches on a never-liked post', () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    queryClient = new QueryClient();
    clearAllVoteCaches();
  });

  it('writes the first like into the feed cache (the old guard no-opped here)', () => {
    // The API omits totalVotes entirely on a post with no votes, so the item
    // the feed holds has no count field to patch. The count then lived only in
    // ActionBar's local state and the post's own page opened showing 0 likes.
    const key = ['unified-feed', { status: 'minted' }, 20, '0xviewer'];
    queryClient.setQueryData(key, {
      pages: [{ items: [{ tokenId: 5004, minter: '0xa' }], page: 1 }],
      pageParams: [1],
    });

    patchFeedCaches(queryClient, '5004', VOTE);

    const item = feedItems(queryClient, key)[0];
    expect(item.isLiked).toBe(true);
    expect(resolveLikeCount(item)).toBe(1);
  });

  it('still patches mapped card shapes by their own count fields', () => {
    const key = ['unified-feed', {}, 20, null];
    queryClient.setQueryData(key, {
      pages: [{ items: [
        { id: '5004', type: 'video', likeCount: 0, dislikeCount: 0 },
        { id: '5005', type: 'post', stats: { likes: 0, comments: 2 } },
      ], page: 1 }],
      pageParams: [1],
    });

    patchFeedCaches(queryClient, '5004', VOTE);
    patchFeedCaches(queryClient, '5005', VOTE);

    const [video, text] = feedItems(queryClient, key);
    expect(video).toMatchObject({ isLiked: true, likeCount: 1 });
    expect(text.stats).toEqual({ likes: 1, comments: 2 });
    expect(text.totalVotes).toBeUndefined();
  });
});

describe('mergeViewerState', () => {
  it('keeps the viewer flags when the response came back anonymous', () => {
    // Expired token → api.dehub.io answers 200 with no viewer fields, not 401.
    const fresh = { tokenId: 5004, totalVotes: { for: 9, against: 0 } };
    const shown = { tokenId: 5004, totalVotes: { for: 8, against: 0 }, isLiked: true, isSaved: true };

    const merged = mergeViewerState(fresh, shown) as Record<string, unknown>;

    expect(merged.isLiked).toBe(true);
    expect(merged.isSaved).toBe(true);
    // Counts are global and always come from the fresh response.
    expect(resolveLikeCount(merged)).toBe(9);
  });

  it('lets an authenticated response unlike a post', () => {
    const fresh = { tokenId: 5004, isLiked: false, totalVotes: { for: 8 } };
    const shown = { tokenId: 5004, isLiked: true, totalVotes: { for: 9 } };

    expect((mergeViewerState(fresh, shown) as Record<string, unknown>).isLiked).toBe(false);
  });

  it('passes the fresh response through when there is nothing to merge', () => {
    const fresh = { tokenId: 5004 };
    expect(mergeViewerState(fresh, undefined)).toBe(fresh);
    expect(mergeViewerState(fresh, {})).toBe(fresh);
  });

  it('treats an explicitly-undefined flag as absent', () => {
    // The pre-navigation seed writes `isLiked: undefined` for fields the feed
    // item did not carry, so a key-presence check would report a false positive.
    expect(hasViewerFields({ isLiked: undefined })).toBe(false);
    expect(hasViewerFields({ isLiked: false })).toBe(true);
  });
});
