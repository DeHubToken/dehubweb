/**
 * The gift ladder is a cross-platform contract, not a local constant.
 *
 * `selectedTier` travels from whichever client sent the gift, through the
 * backend's gift record, out over the `streamer.tip` broadcast, and into the
 * other client's celebration. The match is on the English name, so a rename
 * here is a silent downgrade to Love Heart on every phone in the room — the
 * exact bug this suite exists to catch. The expected names below are copied
 * from dehub-mobile's constants/gift-tiers.ts; if they diverge, one platform
 * stops celebrating properly and nothing fails loudly.
 */
import { describe, it, expect } from 'vitest';
import { GIFT_TIERS, tierFromAmount, tierFromGift } from '@/lib/live/gift-tiers';

/** key -> [min, wire name], as the mobile app has it. */
const MOBILE_LADDER: Array<[string, number, string]> = [
  ['ultimate', 1_000_000, 'Ultimate Celebration'],
  ['gold10', 750_000, 'Golden Screen (10s)'],
  ['gold3', 500_000, 'Golden Screen (3s)'],
  ['party', 300_000, 'Party Celebration'],
  ['spartans', 200_000, 'Spartans Army'],
  ['magicRing', 100_000, 'Magic Ring'],
  ['crown', 50_000, 'Crown'],
  ['bouquet', 25_000, 'Bouquet of Flowers'],
  ['chocolate', 10_000, 'Box of Chocolate'],
  ['heart', 1_000, 'Love Heart'],
];

describe('live gift tiers', () => {
  it('matches the mobile ladder key for key, amount for amount, name for name', () => {
    expect(GIFT_TIERS.map((t) => [t.key, t.min, t.name])).toEqual(MOBILE_LADDER);
  });

  it('puts an amount on the rung it bought, not the one above it', () => {
    expect(tierFromAmount(1_000).key).toBe('heart');
    expect(tierFromAmount(9_999).key).toBe('heart');
    expect(tierFromAmount(10_000).key).toBe('chocolate');
    expect(tierFromAmount(499_999).key).toBe('party');
    expect(tierFromAmount(500_000).key).toBe('gold3');
    expect(tierFromAmount(5_000_000).key).toBe('ultimate');
  });

  it('still celebrates a gift below the bottom rung', () => {
    // Stream minimums can sit under 1,000 DHB, and a paid gift that plays
    // nothing reads as a broken app rather than a cheap tip.
    expect(tierFromAmount(1).key).toBe('heart');
    expect(tierFromAmount(0).key).toBe('heart');
  });

  it('trusts the tier the sender paid for over the amount', () => {
    // Web sends arbitrary amounts. 600,000 DHB bought as a Golden Screen must
    // play as one instead of rounding down to Party.
    expect(tierFromGift({ amount: 600_000, selectedTier: 'Golden Screen (3s)' }).key).toBe('gold3');
  });

  it('falls back to the amount when the record carries no tier', () => {
    // Every gift web sent before this existed, and mobile's older records.
    expect(tierFromGift({ amount: 300_000 }).key).toBe('party');
    expect(tierFromGift({ amount: 60_000, selectedTier: 'Something Else' }).key).toBe('crown');
  });

  it('gives every tier an emoji and a non-zero duration', () => {
    for (const tier of GIFT_TIERS) {
      expect(tier.emoji.length).toBeGreaterThan(0);
      expect(tier.durationMs).toBeGreaterThan(0);
    }
  });
});
