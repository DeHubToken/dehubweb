import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRemixLinks = vi.fn();
const getRemixCounts = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@/lib/remix-links', () => ({
  getRemixLinks: (...a: unknown[]) => getRemixLinks(...a),
  getRemixCounts: (...a: unknown[]) => getRemixCounts(...a),
}));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain;
  chain.maybeSingle = () => maybeSingle();
  return { supabase: { from: () => chain } };
});

import { currentLiveReaction, forgetReactionSummary, reactionSummary, tokenIdFromPostUrl } from '../reactions';

describe('tokenIdFromPostUrl', () => {
  it('reads the post id from DeHub post links only', () => {
    expect(tokenIdFromPostUrl('https://dehub.io/app/post/123')).toBe(123);
    expect(tokenIdFromPostUrl('https://dehub.io/post/45?ref=x')).toBe(45);
    expect(tokenIdFromPostUrl('https://staging.dehub.io/app/video/9')).toBe(9);
    expect(tokenIdFromPostUrl('https://dehub.io.evil.io/app/post/1')).toBeNull();
    expect(tokenIdFromPostUrl('http://dehub.io/app/post/1')).toBeNull();
    expect(tokenIdFromPostUrl('https://dehub.io/app/post/abc')).toBeNull();
  });
});

describe('reactionSummary', () => {
  beforeEach(() => {
    getRemixLinks.mockReset();
    getRemixCounts.mockReset();
    for (const id of [1, 2, 3, 4]) forgetReactionSummary(id);
  });

  it('asks once for every post in the same tick and only credits reactions', async () => {
    getRemixLinks.mockResolvedValue({
      1: { kind: 'react', sourceTokenId: 9, sourceUsername: 'alice' },
      3: { kind: 'duet', sourceTokenId: 8, sourceUsername: 'bob' },
    });
    getRemixCounts.mockResolvedValue({ 2: { duets: 0, stitches: 0, reactions: 4 } });
    const [a, b, c] = await Promise.all([reactionSummary(1), reactionSummary('2'), reactionSummary(3)]);
    expect(getRemixLinks).toHaveBeenCalledTimes(1);
    expect(getRemixLinks).toHaveBeenCalledWith([1, 2, 3]);
    expect(a).toEqual({ reactionOf: { tokenId: 9, username: 'alice' }, reactions: 0 });
    expect(b).toEqual({ reactionOf: null, reactions: 4 });
    expect(c).toEqual({ reactionOf: null, reactions: 0 });
    await reactionSummary(1);
    expect(getRemixLinks).toHaveBeenCalledTimes(1);
  });

  it('a failed lookup hides the chip and is asked again next time', async () => {
    getRemixLinks.mockRejectedValueOnce(new Error('down'));
    getRemixCounts.mockResolvedValueOnce({});
    expect(await reactionSummary(4)).toEqual({ reactionOf: null, reactions: 0 });
    getRemixLinks.mockResolvedValueOnce({});
    getRemixCounts.mockResolvedValueOnce({ 4: { duets: 0, stitches: 0, reactions: 1 } });
    expect(await reactionSummary(4)).toEqual({ reactionOf: null, reactions: 1 });
  });
});

describe('currentLiveReaction', () => {
  it('returns the video a stream has on screen, or null', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { source_token_id: '77', source_username: 'carol' } });
    expect(await currentLiveReaction(5)).toEqual({ sourceTokenId: 77, sourceUsername: 'carol' });
    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await currentLiveReaction(5)).toBeNull();
  });
});
