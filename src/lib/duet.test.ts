import { describe, expect, it } from 'vitest';
import { duetCaption, duetOfPost, duetsPath } from './duet';

describe('duets', () => {
  it('reads the original from a quote post tagged #duet', () => {
    expect(duetOfPost({ isQuotePost: true, quotedTokenId: 42, category: ['General', 'Duet'], quotedPost: { minterUsername: 'mal' } }))
      .toEqual({ tokenId: '42', username: 'mal' });
  });

  it('ignores quotes that are not duets, and duet tags that quote nothing', () => {
    expect(duetOfPost({ isQuotePost: true, quotedTokenId: 42, category: ['General'] })).toBeUndefined();
    expect(duetOfPost({ isQuotePost: false, quotedTokenId: 42, category: 'Duet' })).toBeUndefined();
    expect(duetOfPost({ isQuotePost: true, category: 'duet' })).toBeUndefined();
  });

  it('writes the caption and the list path', () => {
    expect(duetCaption('mal')).toBe('Duet with @mal #duet');
    expect(duetCaption()).toBe('Duet #duet');
    expect(duetsPath(7)).toBe('/app/post/7/duets');
  });
});
