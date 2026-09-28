import { describe, expect, it } from 'vitest';
import { BADGE_ORDER } from '@/lib/staking-badges';
import { badgePerksForIndex, platformFeeForIndex } from '@/lib/badge-perks';

describe('badge perks', () => {
  it('matches the docs fee table: 0.69% off per rung, Megalodon at 1%', () => {
    expect(platformFeeForIndex(-1)).toBe(10);
    expect(platformFeeForIndex(0)).toBe(9.31);
    expect(platformFeeForIndex(11)).toBe(1.72);
    expect(platformFeeForIndex(12)).toBe(1);
  });

  it('never gets worse climbing a rung', () => {
    for (let i = 0; i < BADGE_ORDER.length; i++) {
      const lower = badgePerksForIndex(i - 1);
      const higher = badgePerksForIndex(i);
      expect(higher.tier).toBe(BADGE_ORDER[i]);
      expect(higher.platformFee).toBeLessThan(lower.platformFee);
      expect(higher.voteWeight).toBeGreaterThan(lower.voteWeight);
      expect(higher.reach).toBeGreaterThan(lower.reach);
      expect(higher.feedPostsPerDay).toBeGreaterThanOrEqual(lower.feedPostsPerDay);
      expect(higher.imagesPerPost).toBeGreaterThanOrEqual(lower.imagesPerPost);
      expect(higher.uploadBytesPerDay).toBeGreaterThanOrEqual(lower.uploadBytesPerDay);
      expect(higher.editorStorageBytes).toBeGreaterThan(lower.editorStorageBytes);
      expect(higher.savedProfiles).toBeGreaterThanOrEqual(lower.savedProfiles);
      expect(higher.lendingSlots).toBe(i + 1);
    }
  });

  it('frees voice cloning from Blue Whale up', () => {
    expect(badgePerksForIndex(BADGE_ORDER.indexOf('Killer Whale')).freeVoiceCloning).toBe(false);
    expect(badgePerksForIndex(BADGE_ORDER.indexOf('Blue Whale')).freeVoiceCloning).toBe(true);
    expect(badgePerksForIndex(BADGE_ORDER.indexOf('Megalodon')).freeVoiceCloning).toBe(true);
  });
});
