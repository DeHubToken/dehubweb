/**
 * The badge ladder is pegged in dollars and grandfathered per holder, which
 * makes it two rules that can quietly contradict each other: the ladder moves,
 * and a tier already earned does not. These pin both, plus the property that
 * makes the whole thing safe to ship — at the anchor price the scaled ladder
 * is byte-identical to the reference one, so nobody's badge moves on the day
 * this lands.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  BADGE_LEVELS,
  BADGE_ORDER,
  BADGE_PRICE_ANCHOR,
  BADGE_USD_TARGETS,
  MAX_BADGE_SCALE,
  MIN_BADGE_SCALE,
  activeBadgeScale,
  badgeScaleForPrice,
  badgeThreshold,
  badgeThresholds,
  getBadgeName,
  getBadgeStanding,
  parseBadgeLock,
  ratchetBadgeLock,
  setActiveBadgeScale,
} from '@/lib/staking-badges';

afterEach(() => {
  setActiveBadgeScale(MAX_BADGE_SCALE);
});

describe('badgeScaleForPrice', () => {
  it('is 1 at the anchor price, so today’s ladder is unchanged', () => {
    expect(badgeScaleForPrice(BADGE_PRICE_ANCHOR)).toBe(1);
  });

  it('halves the DHB requirement when the token doubles', () => {
    expect(badgeScaleForPrice(0.002)).toBe(0.5);
    expect(badgeScaleForPrice(0.01)).toBe(0.1);
  });

  it('never rises above 1 — a cheaper token does not raise the bar', () => {
    expect(badgeScaleForPrice(0.0005)).toBe(1);
    expect(badgeScaleForPrice(0.0000001)).toBe(1);
  });

  it('floors at MIN_BADGE_SCALE so the ladder stays in whole tokens', () => {
    expect(badgeScaleForPrice(100)).toBe(MIN_BADGE_SCALE);
  });

  it('rounds to two significant figures, so a wobble is not a renumbering', () => {
    // 0.001 / 0.0034 = 0.2941…, and a 1% move either side lands on the same rung.
    expect(badgeScaleForPrice(0.0034)).toBe(badgeScaleForPrice(0.00341));
    expect(badgeScaleForPrice(0.0034)).toBe(0.29);
  });

  it('falls back to the reference ladder on an unreadable price', () => {
    expect(badgeScaleForPrice(undefined)).toBe(1);
    expect(badgeScaleForPrice(null)).toBe(1);
    expect(badgeScaleForPrice(0)).toBe(1);
    expect(badgeScaleForPrice(Number.NaN)).toBe(1);
    expect(badgeScaleForPrice(-5)).toBe(1);
  });

  it('reads a price that arrived as a string', () => {
    expect(badgeScaleForPrice('0.002')).toBe(0.5);
  });
});

describe('badgeThresholds', () => {
  it('reproduces the reference ladder exactly at the anchor price', () => {
    expect(badgeThresholds(1)).toEqual(BADGE_LEVELS);
  });

  it('holds each tier’s dollar cost roughly constant as the price moves', () => {
    for (const price of [0.001, 0.002, 0.005, 0.01, 0.05, 0.25]) {
      const ladder = badgeThresholds(badgeScaleForPrice(price));
      for (const rung of ladder) {
        const usd = rung.min * price;
        const target = BADGE_USD_TARGETS[rung.name];
        // Two-significant-figure scale plus three-figure rounding; 6% is the
        // widest that combination can drift.
        expect(Math.abs(usd - target) / target).toBeLessThan(0.06);
      }
    }
  });

  it('stays strictly ascending at every scale, so no tier can swallow another', () => {
    for (const price of [0.001, 0.0013, 0.0034, 0.007, 0.019, 0.4, 1, 50]) {
      const ladder = badgeThresholds(badgeScaleForPrice(price));
      expect(ladder.map(r => r.name)).toEqual(BADGE_ORDER);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i].min).toBeGreaterThan(ladder[i - 1].min);
      }
      expect(ladder[0].min).toBeGreaterThanOrEqual(1);
    }
  });

  it('quotes the numbers the peg promises — 50M for Meglodon at $0.001', () => {
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.001))).toBe(50_000_000);
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.01))).toBe(5_000_000);
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.1))).toBe(500_000);
  });
});

describe('getBadgeName', () => {
  it('is unchanged from the flat ladder at the anchor price', () => {
    expect(getBadgeName(9_999)).toBeNull();
    expect(getBadgeName(10_000)).toBe('Crab');
    expect(getBadgeName(49_999_999)).toBe('Blue Whale');
    expect(getBadgeName(50_000_000)).toBe('Meglodon');
  });

  it('lets a smaller bag reach a higher tier once the token is worth more', () => {
    const scale = badgeScaleForPrice(0.01);
    expect(getBadgeName(5_000_000, null, { scale })).toBe('Meglodon');
    expect(getBadgeName(5_000_000)).toBe('Killer Whale');
  });

  it('still honours the username override table', () => {
    expect(getBadgeName(0, 'maldoteth')).toBe('Meglodon');
    expect(getBadgeName(undefined, '@Mal')).toBe('Meglodon');
  });

  it('reads the active scale when a caller passes none', () => {
    setActiveBadgeScale(0.1);
    expect(activeBadgeScale()).toBe(0.1);
    expect(getBadgeName(5_000_000)).toBe('Meglodon');
  });
});

describe('the grandfather lock', () => {
  const cheapLadder = badgeScaleForPrice(0.01); // Meglodon costs 5,000,000

  it('keeps a tier when the ladder climbs back over the holder', () => {
    const lock = ratchetBadgeLock(null, 5_000_000, cheapLadder);
    expect(lock).toEqual({ tier: 'Meglodon', requirement: 5_000_000 });

    // Price falls back to the anchor: Meglodon is 50M again, and 5M would
    // otherwise be a Killer Whale.
    expect(getBadgeName(5_000_000, null, { scale: 1 })).toBe('Killer Whale');
    expect(getBadgeName(5_000_000, null, { scale: 1, lock })).toBe('Meglodon');
  });

  it('drops the tier the moment the holder sells below what it cost them', () => {
    const lock = { tier: 'Meglodon', requirement: 5_000_000 };
    expect(getBadgeName(5_000_000, null, { scale: 1, lock })).toBe('Meglodon');
    // One token under, and they are back on whatever the live ladder says —
    // Tiger Shark, since Killer Whale itself costs 5,000,000 at this scale.
    expect(getBadgeName(4_999_999, null, { scale: 1, lock })).toBe('Tiger Shark');
  });

  it('never demotes someone the live ladder already puts higher', () => {
    const lock = { tier: 'Crab', requirement: 10_000 };
    expect(getBadgeName(50_000_000, null, { scale: 1, lock })).toBe('Meglodon');
  });

  it('ratchets the tier up and the requirement down, never the reverse', () => {
    let lock = ratchetBadgeLock(null, 10_000, 1);
    expect(lock).toEqual({ tier: 'Crab', requirement: 10_000 });

    // Same tier, cheaper ladder: the cheaper number is the one that sticks.
    lock = ratchetBadgeLock(lock, 1_000, badgeScaleForPrice(0.01));
    expect(lock).toEqual({ tier: 'Crab', requirement: 1_000 });

    // Back to the dear ladder at the same tier: nothing moves.
    expect(ratchetBadgeLock(lock, 10_000, 1)).toEqual({ tier: 'Crab', requirement: 1_000 });

    // A higher tier replaces it outright.
    lock = ratchetBadgeLock(lock, 50_000_000, 1);
    expect(lock).toEqual({ tier: 'Meglodon', requirement: 50_000_000 });

    // And a later dip cannot walk the tier back down.
    expect(ratchetBadgeLock(lock, 10_000, 1)).toEqual({ tier: 'Meglodon', requirement: 50_000_000 });
  });

  it('leaves the lock alone when there is nothing to read', () => {
    expect(ratchetBadgeLock(null, undefined, 1)).toBeNull();
    expect(ratchetBadgeLock(null, 5, 1)).toBeNull();
    const lock = { tier: 'Crab', requirement: 10_000 };
    expect(ratchetBadgeLock(lock, null, 1)).toEqual(lock);
  });

  it('discards a malformed lock rather than throwing', () => {
    expect(parseBadgeLock(null)).toBeNull();
    expect(parseBadgeLock({ tier: 'Kraken', requirement: 10 })).toBeNull();
    expect(parseBadgeLock({ tier: 'Crab', requirement: 0 })).toBeNull();
    expect(parseBadgeLock({ tier: 'Crab' })).toBeNull();
    expect(parseBadgeLock({ tier: 'Crab', requirement: '2500' })).toEqual({ tier: 'Crab', requirement: 2500 });
    expect(getBadgeName(5_000_000, null, { scale: 1, lock: { tier: 'Kraken' } as never })).toBe('Killer Whale');
  });
});

describe('getBadgeStanding', () => {
  it('fills across the current tier, not across the whole ladder', () => {
    // Halfway between Crab (10k) and Lobster (25k).
    const standing = getBadgeStanding(17_500, { scale: 1 });
    expect(standing.tier).toBe('Crab');
    expect(standing.nextTier).toBe('Lobster');
    expect(standing.nextThreshold).toBe(25_000);
    expect(standing.remaining).toBe(7_500);
    expect(standing.progress).toBeCloseTo(0.5, 5);
  });

  it('runs from zero to Crab for someone with no badge yet', () => {
    const standing = getBadgeStanding(5_000, { scale: 1 });
    expect(standing.tier).toBeNull();
    expect(standing.index).toBe(-1);
    expect(standing.nextTier).toBe('Crab');
    expect(standing.progress).toBeCloseTo(0.5, 5);
  });

  it('is full and has nowhere to go at the top', () => {
    const standing = getBadgeStanding(80_000_000, { scale: 1 });
    expect(standing.tier).toBe('Meglodon');
    expect(standing.nextTier).toBeNull();
    expect(standing.remaining).toBe(0);
    expect(standing.progress).toBe(1);
  });

  it('flags a tier that is only held on a lock', () => {
    const lock = { tier: 'Meglodon', requirement: 5_000_000 };
    expect(getBadgeStanding(5_000_000, { scale: 1, lock }).grandfathered).toBe(true);
    expect(getBadgeStanding(50_000_000, { scale: 1, lock }).grandfathered).toBe(false);
  });

  it('treats a missing or negative balance as zero rather than as an error', () => {
    expect(getBadgeStanding(undefined, { scale: 1 }).balance).toBe(0);
    expect(getBadgeStanding(-100, { scale: 1 }).balance).toBe(0);
  });
});
