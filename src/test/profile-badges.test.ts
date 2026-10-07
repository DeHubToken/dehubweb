import { describe, expect, it } from 'vitest';
import { mapUserToProfile } from '@/hooks/use-dehub-profile';
import { getBadgeName, getBadgeUrl } from '@/lib/staking-badges';

describe('profile badges', () => {
  it('keeps Algiers gifted King Cobra with a balance below entry', () => {
    const profile = mapUserToProfile({
      address: '0xalgiers', username: 'algiers', badgeBalance: 943.62, badgeLock: null,
    });

    expect(profile.handle).toBe('@algiers');
    expect(getBadgeName(profile.badgeBalance, profile.handle, {
      scale: 1, lock: profile.badgeLock,
    })).toBe('King Cobra');
    expect(getBadgeUrl(profile.badgeBalance, profile.handle)).toBeTruthy();
  });

  it('preserves a grandfathered tier through the API profile mapping', () => {
    const profile = mapUserToProfile({
      username: 'dehubprime', badgeBalance: 10_000,
      badgeLock: { tier: 'Killer Whale', requirement: 10_000 },
    });

    expect(profile.badgeLock).toEqual({ tier: 'Killer Whale', requirement: 10_000 });
    expect(getBadgeName(profile.badgeBalance, profile.handle, {
      scale: 1, lock: profile.badgeLock,
    })).toBe('Killer Whale');
  });

  it('normalises legacy lock names and rejects a malformed lock', () => {
    expect(mapUserToProfile({
      username: 'holder', badgeLock: { tier: 'Cobra', requirement: 1_000 },
    }).badgeLock).toEqual({ tier: 'King Cobra', requirement: 1_000 });
    expect(mapUserToProfile({
      username: 'holder', badgeLock: { tier: 'unknown', requirement: 1_000 },
    }).badgeLock).toBeNull();
  });
});
