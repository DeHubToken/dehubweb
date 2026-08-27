import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { mergeLiveCounts } from '@/lib/live-counts';
import { setVoteCache, clearAllVoteCaches } from '@/lib/vote-cache';

/**
 * The head poll's whole second job. Three properties have to hold or it does
 * more harm than the stale counts it exists to fix:
 *
 *  - it patches COUNTS and nothing else, so a background refresh can never
 *    reorder the timeline or re-slice it under a reader mid-scroll;
 *  - it leaves untouched items referentially identical, or every card's memo
 *    misses once a minute;
 *  - it never reverts the reader's own optimistic vote, which the polled row
 *    can easily predate.
 */

const KEY = ['unified-feed', { sortBy: 'createdAt' }, 20, null];

function feed(items: unknown[]) {
  return { pages: [{ items, page: 1 }], pageParams: [1] };
}

function itemsIn(client: QueryClient, key: unknown[] = KEY) {
  return (client.getQueryData(key) as { pages: Array<{ items: any[] }> }).pages[0].items;
}

describe('mergeLiveCounts', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    clearAllVoteCaches();
    queryClient = new QueryClient();
  });

  it('lifts counts onto the cached card', () => {
    queryClient.setQueryData(
      KEY,
      feed([{ tokenId: 5205, name: 'post', totalViews: 9, totalVotes: { for: 0, against: 0 }, commentCount: 0 }]),
    );

    mergeLiveCounts(queryClient, [
      { tokenId: 5205, totalViews: 16, totalVotes: { for: 1, against: 0 }, commentCount: 2 },
    ]);

    expect(itemsIn(queryClient)[0]).toMatchObject({
      name: 'post',
      totalViews: 16,
      totalVotes: { for: 1, against: 0 },
      commentCount: 2,
    });
  });

  it('leaves order, media and unrelated fields alone', () => {
    queryClient.setQueryData(
      KEY,
      feed([
        { tokenId: 1, imageUrl: 'a.jpg', totalViews: 1 },
        { tokenId: 2, imageUrl: 'b.jpg', totalViews: 2 },
      ]),
    );

    // The poll returns them the other way round, with a post the feed hasn't got.
    mergeLiveCounts(queryClient, [
      { tokenId: 9, totalViews: 99 },
      { tokenId: 2, totalViews: 20, imageUrl: 'REPLACED.jpg' },
      { tokenId: 1, totalViews: 10 },
    ]);

    const items = itemsIn(queryClient);
    expect(items.map((i) => i.tokenId)).toEqual([1, 2]);
    expect(items[1].imageUrl).toBe('b.jpg');
    expect(items.map((i) => i.totalViews)).toEqual([10, 20]);
  });

  it('keeps unchanged items referentially identical', () => {
    const still = { tokenId: 1, totalViews: 7 };
    queryClient.setQueryData(KEY, feed([still, { tokenId: 2, totalViews: 1 }]));

    mergeLiveCounts(queryClient, [
      { tokenId: 1, totalViews: 7 },
      { tokenId: 2, totalViews: 4 },
    ]);

    expect(itemsIn(queryClient)[0]).toBe(still);
  });

  it('is a no-op when nothing moved', () => {
    const before = feed([{ tokenId: 1, totalViews: 7 }]);
    queryClient.setQueryData(KEY, before);

    mergeLiveCounts(queryClient, [{ tokenId: 1, totalViews: 7 }]);

    expect(queryClient.getQueryData(KEY)).toBe(before);
  });

  it('does not revert an optimistic vote the server has yet to catch up with', () => {
    queryClient.setQueryData(KEY, feed([{ tokenId: 5205, totalViews: 9, totalVotes: { for: 1, against: 0 }, isLiked: true }]));
    setVoteCache('5205', { isLiked: true, isDisliked: false, likeCount: 1, dislikeCount: 0 });

    // The polled row predates the like.
    mergeLiveCounts(queryClient, [
      { tokenId: 5205, totalViews: 16, totalVotes: { for: 0, against: 0 }, isLiked: false },
    ]);

    const item = itemsIn(queryClient)[0];
    expect(item.totalViews).toBe(16);
    expect(item.totalVotes.for).toBe(1);
    expect(item.isLiked).toBe(true);
  });

  it('patches every cached feed variant holding the post, not just one', () => {
    const profileKey = ['unified-feed', { minter: '0xabc' }, 20, null];
    queryClient.setQueryData(KEY, feed([{ tokenId: 5205, totalViews: 9 }]));
    queryClient.setQueryData(profileKey, feed([{ tokenId: 5205, totalViews: 9 }]));

    mergeLiveCounts(queryClient, [{ tokenId: 5205, totalViews: 16 }]);

    expect(itemsIn(queryClient)[0].totalViews).toBe(16);
    expect(itemsIn(queryClient, profileKey)[0].totalViews).toBe(16);
  });

  it('does not pass a count patch off as a refetch', () => {
    queryClient.setQueryData(KEY, feed([{ tokenId: 1, totalViews: 1 }]));
    const query = queryClient.getQueryCache().findAll({ queryKey: ['unified-feed'] })[0];
    query.setState({ ...query.state, dataUpdatedAt: 0 });

    mergeLiveCounts(queryClient, [{ tokenId: 1, totalViews: 2 }]);

    // Still stale: the list itself was never revalidated, only its numbers.
    expect(query.state.dataUpdatedAt).toBe(0);
  });
});
