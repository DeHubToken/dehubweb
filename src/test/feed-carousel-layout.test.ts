import { expect, it } from 'vitest';
import { homeReelBatchIndex, homeSuggestedAfter } from '@/lib/feed-carousel-layout';

const reels = (columns: number, total = 20) => Array.from({ length: total }, (_, index) => index + 1)
  .flatMap(posts => {
    const batch = homeReelBatchIndex(posts, columns, total);
    return batch < 0 ? [] : [{ posts, batch }];
  });

it('fills the opening fullscreen row without dropping or duplicating reel batches', () => {
  expect(reels(3)).toEqual([{ posts: 3, batch: 0 }, { posts: 6, batch: 1 }, { posts: 18, batch: 2 }]);
  expect(reels(2)[0]).toEqual({ posts: 2, batch: 0 });
  expect(reels(1)).toEqual([{ posts: 1, batch: 0 }, { posts: 6, batch: 1 }, { posts: 18, batch: 2 }]);
});

it('still shows the opening reel on a feed shorter than a full row', () => {
  expect(reels(3, 2)).toEqual([{ posts: 2, batch: 0 }]);
  expect(reels(3, 1)).toEqual([{ posts: 1, batch: 0 }]);
  expect(reels(3, 0)).toEqual([]);
});

it('keeps account suggestions apart from the opening reels', () => {
  expect(homeSuggestedAfter(1)).toBe(3);
  for (const columns of [2, 3]) {
    const suggestions = homeSuggestedAfter(columns);
    expect(reels(columns).every(reel => Math.abs(reel.posts - suggestions) >= 2)).toBe(true);
  }
});
