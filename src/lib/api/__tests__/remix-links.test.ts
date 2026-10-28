import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args), functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn(async () => 'token') }));

import { forgetReactionSummary, reactionSummary, tokenIdFromPostUrl } from '../remix-links';

describe('tokenIdFromPostUrl', () => {
  it('reads the post id from every DeHub post link shape', () => {
    expect(tokenIdFromPostUrl('https://dehub.io/app/post/123')).toBe(123);
    expect(tokenIdFromPostUrl('https://dehub.io/post/45?ref=x')).toBe(45);
    expect(tokenIdFromPostUrl('https://staging.dehub.io/app/video/9')).toBe(9);
    expect(tokenIdFromPostUrl('https://www.dehub.io/app/post/77/reactions')).toBe(77);
  });

  it('refuses anything that is not a DeHub post', () => {
    expect(tokenIdFromPostUrl('https://evil.io/app/post/1')).toBeNull();
    expect(tokenIdFromPostUrl('https://dehub.io.evil.io/app/post/1')).toBeNull();
    expect(tokenIdFromPostUrl('https://dehub.io/app/post/abc')).toBeNull();
    expect(tokenIdFromPostUrl('http://dehub.io/app/post/1')).toBeNull();
  });
});

describe('reactionSummary', () => {
  beforeEach(() => {
    rpc.mockReset();
    for (const id of [1, 2, 3, 4]) forgetReactionSummary(id);
  });

  it('asks once for every post requested in the same tick', async () => {
    rpc.mockResolvedValue({ data: [
      { token_id: 1, reaction_of: 9, reaction_of_username: 'alice', reaction_of_title: 'Original', reactions: 0 },
      { token_id: 2, reaction_of: null, reaction_of_username: null, reaction_of_title: null, reactions: 3 },
    ] });
    const [a, b, c] = await Promise.all([reactionSummary(1), reactionSummary('2'), reactionSummary(3)]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toEqual({ token_ids: [1, 2, 3] });
    expect(a).toEqual({ reactionOf: { tokenId: 9, username: 'alice', title: 'Original' }, reactions: 0 });
    expect(b).toEqual({ reactionOf: null, reactions: 3 });
    expect(c).toEqual({ reactionOf: null, reactions: 0 });
    await reactionSummary(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a failed lookup hides the chip and is asked again next time', async () => {
    rpc.mockRejectedValueOnce(new Error('down'));
    expect(await reactionSummary(4)).toEqual({ reactionOf: null, reactions: 0 });
    rpc.mockResolvedValueOnce({ data: [{ token_id: 4, reaction_of: null, reaction_of_username: null, reaction_of_title: null, reactions: 1 }] });
    expect(await reactionSummary(4)).toEqual({ reactionOf: null, reactions: 1 });
  });

  it('ignores ids that are not post ids', async () => {
    expect(await reactionSummary('abc')).toEqual({ reactionOf: null, reactions: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
