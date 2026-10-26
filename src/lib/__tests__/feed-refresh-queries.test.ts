import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { refreshFeedQueries } from '@/lib/feed-refresh-queries';

describe('refreshFeedQueries', () => {
  it('marks every feed list stale, the pinned post and Music included', () => {
    const client = new QueryClient();
    const keys = [
      ['unified-feed', { sortBy: 'createdAt' }, 20, null],
      ['pinned-post', '2008'],
      ['dehub-feed', 'shorts'],
      ['music-videos-infinite', null],
      ['music-audio-uploads', null, 'trending'],
      ['music-video-chart', 'cinematic', 'views'],
      ['radio-chart-top'],
      ['dehub-live', 'home'],
    ];
    for (const key of keys) client.setQueryData(key, { ok: true });

    refreshFeedQueries(client);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  });

  it('leaves unrelated queries alone', () => {
    const client = new QueryClient();
    client.setQueryData(['wallet-balance'], 1);
    refreshFeedQueries(client);
    expect(client.getQueryState(['wallet-balance'])?.isInvalidated).toBe(false);
  });
});
