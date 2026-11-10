import { describe, it, expect } from 'vitest';
import { mapApiLiveStreamToLocal, watchingNowOf } from '@/hooks/use-dehub-feed';

/**
 * The Live now row showed 32 beside LIVE for a room of 8: it read totalViews,
 * which counts every join. Anything beside LIVE now reads the room itself.
 */
describe('watching now on live badges', () => {
  it('is the room right now, never the join tally or the peak', () => {
    expect(watchingNowOf({ viewerCount: 8, totalViews: 32, peakViewers: 12 } as never)).toBe(8);
    expect(watchingNowOf({ viewerCount: 0 })).toBe(0);
  });

  it('says nothing rather than guess when the list has no count', () => {
    expect(watchingNowOf({ totalViews: 32 } as never)).toBeNull();
    expect(watchingNowOf(null)).toBeNull();
    expect(watchingNowOf({ viewerCount: 'lots' })).toBeNull();
    expect(watchingNowOf({ viewerCount: -1 })).toBeNull();
  });

  it('keeps all-time joins and the room apart on a mapped stream', () => {
    const stream = mapApiLiveStreamToLocal({ _id: 'a', status: 'LIVE', totalViews: 32, viewerCount: 8 } as never, 0);
    expect(stream.viewers).toBe('32');
    expect(stream.watching).toBe('8');
    const unknown = mapApiLiveStreamToLocal({ _id: 'b', status: 'LIVE', totalViews: 32 } as never, 1);
    expect(unknown.watching).toBe('');
  });
});
