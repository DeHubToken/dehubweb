import { describe, it, expect } from 'vitest';
import {
  applyReactionDelta,
  asReaction,
  isPositiveReaction,
  reactionForTap,
  reconcileReactionCounts,
  resolveLeadReaction,
  seedReactionCounts,
  POST_REACTIONS,
  REACTION_LIST,
} from '@/lib/reactions';
import {
  applyVoteStateToNFT,
  resolveMyReaction,
  resolveReactionCounts,
} from '@/lib/engagement';

describe('reaction taxonomy', () => {
  it('exposes all nine reactions in picker order', () => {
    expect(POST_REACTIONS).toEqual([
      'like', 'love', 'respect', 'hot', 'lol', 'sad', 'cry', 'dislike', 'poo',
    ]);
    expect(REACTION_LIST).toHaveLength(9);
  });

  it('treats only dislike and poo as negative', () => {
    const negative = POST_REACTIONS.filter((key) => !isPositiveReaction(key));
    expect(negative).toEqual(['dislike', 'poo']);
  });

  it('rejects unknown reaction keys rather than guessing', () => {
    expect(asReaction('love')).toBe('love');
    expect(asReaction('LOVE')).toBe('love');
    expect(asReaction('banana')).toBeNull();
    expect(asReaction(undefined)).toBeNull();
  });
});

describe('resolveLeadReaction', () => {
  it('picks the most-used reaction', () => {
    expect(resolveLeadReaction({ like: 3, love: 9 })).toBe('love');
  });

  it('leads with the plain thumbs-up when likes are ahead', () => {
    expect(resolveLeadReaction({ like: 9, love: 3, hot: 2 })).toBeNull();
  });

  it('breaks ties by picker order, so like beats love', () => {
    expect(resolveLeadReaction({ like: 4, love: 4 })).toBeNull();
    expect(resolveLeadReaction({ love: 4, hot: 4 })).toBe('love');
  });

  it('never leads with a negative reaction — that is the thumbs-down', () => {
    expect(resolveLeadReaction({ like: 1, poo: 9 })).toBeNull();
    expect(resolveLeadReaction({ dislike: 4 })).toBeNull();
    expect(resolveLeadReaction({ love: 1, dislike: 9 })).toBe('love');
  });

  it("lets the viewer's own reaction outrank the crowd's", () => {
    expect(resolveLeadReaction({ like: 40 }, 'lol')).toBe('lol');
    expect(resolveLeadReaction({ love: 40 }, 'like')).toBeNull();
  });

  it("ignores the viewer's own reaction when it is a negative one", () => {
    expect(resolveLeadReaction({ hot: 3 }, 'poo')).toBe('hot');
    expect(resolveLeadReaction({ like: 3 }, 'dislike')).toBeNull();
  });

  it('returns null when nobody has reacted', () => {
    expect(resolveLeadReaction({})).toBeNull();
    expect(resolveLeadReaction({ like: 0 })).toBeNull();
    expect(resolveLeadReaction(null)).toBeNull();
  });
});

describe('reactionForTap', () => {
  it('casts the reaction the thumb is wearing, not a plain like', () => {
    expect(reactionForTap(true, null, { hot: 12, like: 3 })).toBe('hot');
    expect(reactionForTap(true, null, { love: 2 })).toBe('love');
  });

  it('falls back to like when the thumb draws the plain icon', () => {
    expect(reactionForTap(true, null, { like: 9, hot: 2 })).toBe('like');
    expect(reactionForTap(true, null, {})).toBe('like');
    expect(reactionForTap(true, null, null)).toBe('like');
  });

  it('re-sends the held reaction, which is how the server un-reacts it', () => {
    expect(reactionForTap(true, 'lol', { hot: 40 })).toBe('lol');
    expect(reactionForTap(true, 'like', { hot: 40 })).toBe('like');
    expect(reactionForTap(false, 'poo', {})).toBe('poo');
    expect(reactionForTap(false, 'dislike', {})).toBe('dislike');
  });

  it('keeps the thumbs-down a plain dislike — it never wears a glyph', () => {
    expect(reactionForTap(false, null, { hot: 40 })).toBe('dislike');
    expect(reactionForTap(false, 'hot', { hot: 40 })).toBe('dislike');
  });

  it('switches polarity to whatever the thumb shows', () => {
    expect(reactionForTap(true, 'poo', { hot: 5 })).toBe('hot');
    expect(reactionForTap(true, 'poo', { like: 5 })).toBe('like');
  });
});

describe('applyReactionDelta', () => {
  it('adds a first reaction', () => {
    expect(applyReactionDelta({}, null, 'love')).toEqual({ love: 1 });
  });

  it('moves the count when switching reactions', () => {
    expect(applyReactionDelta({ like: 3, love: 1 }, 'like', 'love')).toEqual({ like: 2, love: 2 });
  });

  it('removes a reaction when toggled off', () => {
    expect(applyReactionDelta({ hot: 2 }, 'hot', null)).toEqual({ hot: 1 });
  });

  it('never goes negative on a count the client never saw', () => {
    expect(applyReactionDelta({}, 'like', null)).toEqual({ like: 0 });
  });

  it('is a no-op when the reaction is unchanged', () => {
    expect(applyReactionDelta({ like: 5 }, 'like', 'like')).toEqual({ like: 5 });
  });
});

describe('resolveReactionCounts', () => {
  it('uses the API breakdown when it agrees with the counts', () => {
    expect(resolveReactionCounts({ reactionCounts: { love: 4 }, totalVotes: { for: 4 } }))
      .toEqual({ love: 4 });
  });

  it('scales a drifted breakdown to fit the like count instead of contradicting the card', () => {
    // Hand-edited totals on the backend left this split behind: the card
    // reads 10 likes, the stored tray only accounted for 4.
    expect(resolveReactionCounts({ reactionCounts: { like: 4 }, totalVotes: { for: 10 } }))
      .toEqual({ like: 10 });
  });

  it('keeps the shape of a multi-reaction split when scaling', () => {
    // 4×👍 + 1×❤️ against a headline of 10 → 8×👍 + 2×❤️, not 10×👍.
    expect(resolveReactionCounts({ reactionCounts: { like: 4, love: 1 }, totalVotes: { for: 10 } }))
      .toEqual({ like: 8, love: 2 });
  });

  it('seeds from totalVotes for posts voted on before reactions shipped', () => {
    // The whole point: a long-lived post arrives with a real like count and no
    // breakdown at all. Treating that as "no reactions" would blank the
    // summary on exactly the posts with the most engagement.
    expect(resolveReactionCounts({ totalVotes: { for: 144, against: 2 } }))
      .toEqual({ like: 144, dislike: 2 });
  });

  it('seeds rather than trusting an all-zero breakdown', () => {
    expect(resolveReactionCounts({ reactionCounts: {}, totalVotes: { for: 7 } }))
      .toEqual({ like: 7 });
  });

  it('yields nothing for a post nobody has touched', () => {
    expect(resolveReactionCounts({})).toEqual({});
  });
});

describe('reconcileReactionCounts', () => {
  it('always sums back to the requested totals after rounding', () => {
    const counts = reconcileReactionCounts(101, 7, { like: 13, love: 5, hot: 1, dislike: 2, poo: 1 });
    const positive = (counts.like ?? 0) + (counts.love ?? 0) + (counts.hot ?? 0) +
      (counts.respect ?? 0) + (counts.lol ?? 0) + (counts.sad ?? 0) + (counts.cry ?? 0);
    const negative = (counts.dislike ?? 0) + (counts.poo ?? 0);
    expect(positive).toBe(101);
    expect(negative).toBe(7);
  });

  it('is deterministic for identical inputs', () => {
    const a = reconcileReactionCounts(9, 2, { like: 2, respect: 1, lol: 1, poo: 3 });
    const b = reconcileReactionCounts(9, 2, { like: 2, respect: 1, lol: 1, poo: 3 });
    expect(a).toEqual(b);
  });

  it('zeroes a side whose rollup dropped to zero', () => {
    expect(reconcileReactionCounts(0, 3, { like: 7, dislike: 1 })).toEqual({ dislike: 3 });
  });

  it('falls back to seeding when there is no stored split', () => {
    expect(reconcileReactionCounts(5, 2, null)).toEqual({ like: 5, dislike: 2 });
    expect(reconcileReactionCounts(5, 2, {})).toEqual({ like: 5, dislike: 2 });
  });
});

describe('seedReactionCounts', () => {
  it('omits zero sides instead of writing them', () => {
    expect(seedReactionCounts(5, 0)).toEqual({ like: 5 });
    expect(seedReactionCounts(0, 0)).toEqual({});
  });
});

describe('resolveMyReaction', () => {
  it('prefers the explicit reaction', () => {
    expect(resolveMyReaction({ myReaction: 'hot', isLiked: true })).toBe('hot');
  });

  it('falls back to the polarity flags for pre-reaction responses', () => {
    expect(resolveMyReaction({ isLiked: true })).toBe('like');
    expect(resolveMyReaction({ isDisliked: true })).toBe('dislike');
  });

  it('is null when the viewer has not reacted', () => {
    expect(resolveMyReaction({ isLiked: false })).toBeNull();
    expect(resolveMyReaction(null)).toBeNull();
  });
});

describe('applyVoteStateToNFT with reactions', () => {
  const BASE = { tokenId: 5004, totalVotes: { for: 3, against: 0 } };

  it('writes the reaction and its breakdown', () => {
    const patched = applyVoteStateToNFT(BASE, {
      isLiked: true,
      isDisliked: false,
      myReaction: 'love',
      likeCount: 4,
      dislikeCount: 0,
      reactionCounts: { love: 1, like: 3 },
    });
    expect(patched.myReaction).toBe('love');
    expect(patched.reactionCounts).toEqual({ love: 1, like: 3 });
    expect(patched.totalVotes).toEqual({ for: 4, against: 0 });
  });

  it('leaves an existing reaction alone when the writer did not resolve one', () => {
    // A surface that only ever casts a plain like (the shorts viewer,
    // governance cards) writes a 4-field VoteState. That must not erase the
    // fact that the viewer loved the post from somewhere else.
    const withReaction = { ...BASE, myReaction: 'love' };
    const patched = applyVoteStateToNFT(withReaction, {
      isLiked: true,
      isDisliked: false,
      likeCount: 4,
      dislikeCount: 0,
    });
    expect(patched.myReaction).toBe('love');
  });

  it('clears the reaction when the writer explicitly resolved none', () => {
    const withReaction = { ...BASE, myReaction: 'love' };
    const patched = applyVoteStateToNFT(withReaction, {
      isLiked: false,
      isDisliked: false,
      myReaction: null,
      likeCount: 3,
      dislikeCount: 0,
    });
    expect(patched.myReaction).toBeNull();
  });
});

describe('reconcileReactionCounts — fractional input', () => {
  it('does not throw on a fractional stored count', () => {
    // The side sum used to come from the RAW stored values while entries came
    // from the floored ones, so 0.5 skipped both early branches with an empty
    // entries array and the rounding loop indexed fractional[NaN].
    expect(() => reconcileReactionCounts(10, 0, { like: 0.5 })).not.toThrow();
    expect(reconcileReactionCounts(10, 0, { like: 0.5 })).toEqual({ like: 10 });
  });

  it("matches the API's answer rather than crashing", () => {
    expect(reconcileReactionCounts(7, 2, { like: 0.4, love: 0.6, poo: 0.9 })).toEqual({
      like: 7,
      dislike: 2,
    });
  });

  it('handles a mix of fractional and whole counts', () => {
    const counts = reconcileReactionCounts(10, 0, { like: 4, love: 0.5 });
    expect((counts.like ?? 0) + (counts.love ?? 0)).toBe(10);
  });
});

describe('resolveReactionCounts — object identity', () => {
  const post = {
    totalVotes: { for: 6, against: 1 },
    reactionCounts: { like: 4, love: 2, dislike: 1 },
  };

  it("returns the post's own object when the reconcile changes nothing", () => {
    expect(resolveReactionCounts(post)).toBe(post.reactionCounts);
  });

  it('is referentially stable across repeated calls', () => {
    expect(resolveReactionCounts(post)).toBe(resolveReactionCounts(post));
  });

  it('still returns a corrected map when the split really is wrong', () => {
    const drifted = { totalVotes: { for: 97, against: 0 }, reactionCounts: { like: 24, love: 6 } };
    const out = resolveReactionCounts(drifted);
    expect(out).not.toBe(drifted.reactionCounts);
    expect((out.like ?? 0) + (out.love ?? 0)).toBe(97);
  });

  it('treats an absent key and a zero key as the same shape', () => {
    const withZero = { totalVotes: { for: 4, against: 0 }, reactionCounts: { like: 4, love: 0 } };
    expect(resolveReactionCounts(withZero)).toBe(withZero.reactionCounts);
  });
});
