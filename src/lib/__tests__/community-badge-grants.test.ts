import { describe, it, expect } from 'vitest';
import { getBadgeName } from '@/lib/staking-badges';
import { badgeTier } from '../../../supabase/functions/_shared/badge-weight';

describe('community badge grants', () => {
  it('applies a grant when no balance is available', () => {
    expect(getBadgeName(null, 'dehubprime', { scale: 1 })).toBe('King Cobra');
  });

  it('normalises the granted username', () => {
    expect(getBadgeName(0, ' @DEHUBPRIME ', { scale: 1 })).toBe('King Cobra');
  });

  it('keeps a higher badge earned after a grant', () => {
    expect(getBadgeName(2_000_000, 'dehubprime', { scale: 1 })).toBe('Dolphin');
  });

  it('keeps a higher grandfathered badge above the grant', () => {
    expect(getBadgeName(10_000, 'dehubprime', {
      scale: 1, lock: { tier: 'Killer Whale', requirement: 10_000 },
    })).toBe('Killer Whale');
  });

  it('leaves accounts without a grant below the entry rung', () => {
    expect(getBadgeName(0, 'not-granted', { scale: 1 })).toBeNull();
  });

  it('keeps governance votes on the same granted and earned tiers', () => {
    expect(badgeTier(0, 'dehubprime', { scale: 1 })).toBe('King Cobra');
    expect(badgeTier(2_000_000, 'dehubprime', { scale: 1 })).toBe('Dolphin');
    expect(badgeTier(10_000, 'dehubprime', {
      scale: 1, lock: { tier: 'Killer Whale', requirement: 10_000 },
    })).toBe('Killer Whale');
  });
});
