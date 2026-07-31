import { describe, it, expect } from 'vitest';
import {
  applyReactionDelta,
  asReaction,
  isPositiveReaction,
  resolveTopReaction,
  seedReactionCounts,
  topReactions,
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

describe('resolveTopReaction', () => {
  it('picks the most-used reaction', () => {
    expect(resolveTopReaction({ like: 3, love: 9, poo: 1 })).toBe('love');
  });

  it('breaks ties by picker order, so like beats love', () => {
    expect(resolveTopReaction({ like: 4, love: 4 })).toBe('like');
    expect(resolveTopReaction({ love: 4, hot: 4 })).toBe('love');
  });

  it('returns null when nobody has reacted', () => {
    expect(resolveTopReaction({})).toBeNull();
    expect(resolveTopReaction({ like: 0 })).toBeNull();
    expect(resolveTopReaction(null)).toBeNull();
  });
});

describe('topReactions', () => {
  it('orders by count then picker order, dropping zeros', () => {
    expect(topReactions({ like: 2, love: 5, hot: 2, cry: 0 })).toEqual(['love', 'like', 'hot']);
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
  it('uses the API breakdown when present', () => {
    expect(resolveReactionCounts({ reactionCounts: { love: 4 }, totalVotes: { for: 4 } }))
      .toEqual({ love: 4 });
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
