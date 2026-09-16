import { describe, it, expect } from 'vitest';
import { mapApiLiveStreamToLocal, mapNFTToLiveStream } from '@/hooks/use-dehub-feed';

/**
 * A live stream usually has no cover of its own: the self-hosted ingest renders
 * no thumbnail and the token carries no image. These mappers used to answer
 * that with one of four stock Unsplash photos, so the card showed a stranger's
 * desk as if it were a frame of the broadcast — and the static screen written
 * for exactly this case could never run, because a thumbnail appeared to exist.
 */
describe('live stream covers', () => {
  it('leaves the cover empty rather than inventing one', () => {
    const stream = mapApiLiveStreamToLocal(
      { status: 'OFFLINE', provider: 'mediamtx', playbackId: 'abc123' } as never,
      0,
    );

    expect(stream.thumbnail).toBe('');
  });

  it('keeps a real cover, rebased onto the CDN', () => {
    const stream = mapApiLiveStreamToLocal(
      {
        status: 'OFFLINE',
        provider: 'mediamtx',
        playbackId: 'abc123',
        thumbnail: 'live/thumbnails/deadbeef.jpg',
      } as never,
      0,
    );

    expect(stream.thumbnail).toContain('live/thumbnails/deadbeef.jpg');
    expect(stream.thumbnail).toMatch(/^https?:\/\//);
  });

  it('reads the cover off the stream, which is the only place a live post keeps one', () => {
    const stream = mapNFTToLiveStream(
      { tokenId: 42, postType: 'live', stream: { thumbnail: 'live/thumbnails/cafe.jpg' } } as never,
      0,
    );

    expect(stream.thumbnail).toContain('live/thumbnails/cafe.jpg');
  });

  it('answers empty when a post has no cover anywhere', () => {
    const stream = mapNFTToLiveStream({ tokenId: 43, postType: 'live' } as never, 1);

    expect(stream.thumbnail).toBe('');
  });

  it('never answers with a stock photo', () => {
    const covers = [
      mapApiLiveStreamToLocal({ status: 'OFFLINE' } as never, 1).thumbnail,
      mapApiLiveStreamToLocal({ status: 'OFFLINE' } as never, 2).thumbnail,
      mapNFTToLiveStream({ tokenId: 1 } as never, 3).thumbnail,
    ];

    expect(covers.filter(c => c.includes('unsplash.com'))).toEqual([]);
  });
});
