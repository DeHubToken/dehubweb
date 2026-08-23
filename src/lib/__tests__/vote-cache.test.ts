import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { patchFeedCaches, setVoteCache, getVoteCache, clearAllVoteCaches } from '@/lib/vote-cache';

/**
 * These cover the failure mode that shipped twice: FEED_KEYS listing a query
 * key that no query actually uses ('dehub-videos'/'dehub-images', then
 * 'profile-content'). Nothing throws when that happens — the vote is simply
 * never propagated, so a post liked on one surface renders unliked on another
 * while the counts stay correct. Each key family below must match the key its
 * hook really registers.
 */

const VOTE = { isLiked: true, isDisliked: false, likeCount: 8, dislikeCount: 1 };

function makeInfinite(listKey: 'items' | 'data', items: unknown[]) {
  return { pages: [{ [listKey]: items, page: 1 }], pageParams: [1] };
}

describe('patchFeedCaches', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('patches the home feed (unified-feed, mapped items keyed by id)', () => {
    // Key shape: ['unified-feed', params, limit, viewer]
    const key = ['unified-feed', { status: 'minted' }, 20, '0xviewer'];
    queryClient.setQueryData(
      key,
      makeInfinite('items', [
        { id: '5004', isLiked: false, isDisliked: false, likeCount: 7, dislikeCount: 1 },
        { id: '5005', isLiked: false, likeCount: 3 },
      ]),
    );

    patchFeedCaches(queryClient, '5004', VOTE);

    const pages = (queryClient.getQueryData(key) as any).pages[0].items;
    expect(pages[0]).toMatchObject({ isLiked: true, isDisliked: false, likeCount: 8, dislikeCount: 1 });
    expect(pages[1]).toMatchObject({ isLiked: false, likeCount: 3 });
  });

  it('patches the profile tabs (dehub-user-content, raw API items under `data`)', () => {
    // Key shape: ['dehub-user-content', userId, viewerAddress] — pages carry
    // unmapped API items, so the id is `tokenId` and counts live in totalVotes.
    const key = ['dehub-user-content', '0xcreator', '0xviewer'];
    queryClient.setQueryData(
      key,
      makeInfinite('data', [{ tokenId: 5004, isLiked: false, totalVotes: { for: 7, against: 1 } }]),
    );

    patchFeedCaches(queryClient, '5004', VOTE);

    const item = (queryClient.getQueryData(key) as any).pages[0].data[0];
    expect(item.isLiked).toBe(true);
    expect(item.totalVotes).toEqual({ for: 8, against: 1 });
  });

  it('patches the shorts/images/live tabs (dehub-feed)', () => {
    const key = ['dehub-feed', { postType: 'video', status: 'minted' }];
    queryClient.setQueryData(
      key,
      makeInfinite('data', [{ tokenId: 5004, isLiked: false, totalVotes: { for: 7, against: 1 } }]),
    );

    patchFeedCaches(queryClient, '5004', VOTE);

    expect((queryClient.getQueryData(key) as any).pages[0].data[0].isLiked).toBe(true);
  });

  it('patches every param variant of a feed key, not just one', () => {
    const home = ['unified-feed', { status: 'minted' }, 20, '0xviewer'];
    const explore = ['unified-feed', { status: 'minted', sortBy: 'likes' }, 20, '0xviewer'];
    for (const key of [home, explore]) {
      queryClient.setQueryData(key, makeInfinite('items', [{ id: '5004', isLiked: false, likeCount: 7 }]));
    }

    patchFeedCaches(queryClient, '5004', VOTE);

    for (const key of [home, explore]) {
      expect((queryClient.getQueryData(key) as any).pages[0].items[0].isLiked).toBe(true);
    }
  });

  it('maps the TextPost shape (stats.likes)', () => {
    const key = ['unified-feed', {}, 20, null];
    queryClient.setQueryData(
      key,
      makeInfinite('items', [{ id: '5004', isLiked: false, stats: { likes: 7, comments: 2 } }]),
    );

    patchFeedCaches(queryClient, '5004', VOTE);

    const item = (queryClient.getQueryData(key) as any).pages[0].items[0];
    expect(item.stats).toEqual({ likes: 8, comments: 2 });
  });

  it('maps the TextPost dislike count too (stats.dislikes)', () => {
    const DISLIKE = { isLiked: false, isDisliked: true, likeCount: 7, dislikeCount: 3 };
    const key = ['unified-feed', {}, 20, null];
    queryClient.setQueryData(
      key,
      makeInfinite('items', [{ id: '5004', isDisliked: false, stats: { likes: 7, dislikes: 2, comments: 2 } }]),
    );

    patchFeedCaches(queryClient, '5004', DISLIKE);

    const item = (queryClient.getQueryData(key) as any).pages[0].items[0];
    expect(item.stats).toEqual({ likes: 7, dislikes: 3, comments: 2 });
  });

  it('maps the ImagePost shape (likes / dislikes numbers)', () => {
    const DISLIKE = { isLiked: false, isDisliked: true, likeCount: 7, dislikeCount: 3 };
    const key = ['unified-feed', {}, 20, '0xviewer'];
    queryClient.setQueryData(
      key,
      makeInfinite('items', [{ id: '5004', isDisliked: false, likes: 7, dislikes: 2 }]),
    );

    patchFeedCaches(queryClient, '5004', DISLIKE);

    const item = (queryClient.getQueryData(key) as any).pages[0].items[0];
    expect(item.likes).toBe(7);
    expect(item.dislikes).toBe(3);
  });

  it('leaves unrelated queries untouched', () => {
    const unrelated = ['bookmarks', '0xviewer'];
    const value = makeInfinite('items', [{ id: '5004', isLiked: false }]);
    queryClient.setQueryData(unrelated, value);

    patchFeedCaches(queryClient, '5004', VOTE);

    expect((queryClient.getQueryData(unrelated) as any).pages[0].items[0].isLiked).toBe(false);
  });
});

describe('vote cache entries', () => {
  beforeEach(() => clearAllVoteCaches());

  it('round-trips the vote state used to survive navigation', () => {
    setVoteCache('5004', VOTE);
    expect(getVoteCache('5004')).toEqual(VOTE);
  });

  it('returns null for a post that was never voted on', () => {
    expect(getVoteCache('9999')).toBeNull();
  });
});
