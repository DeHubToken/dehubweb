import { describe, it, expect } from 'vitest';
import { getPostAllowanceForBadge, isWithinQuotaDay, startOfQuotaDay } from '@/lib/post-quota';

describe('getPostAllowanceForBadge', () => {
  it('gives an unbadged wallet one post a day', () => {
    const a = getPostAllowanceForBadge(0);
    expect(a.postsPerDay).toBe(1);
    expect(a.isBaseline).toBe(true);
    expect(a.nextTierName).toBe('Crab');
    expect(a.nextTierPosts).toBe(2);
  });

  it('adds exactly one post per tier', () => {
    expect(getPostAllowanceForBadge(10_000).postsPerDay).toBe(2); // Crab
    expect(getPostAllowanceForBadge(25_000).postsPerDay).toBe(3); // Lobster
    expect(getPostAllowanceForBadge(100_000).postsPerDay).toBe(5); // Tortoise
  });

  it('tops out at Meglodon with fourteen and no next tier', () => {
    const top = getPostAllowanceForBadge(50_000_000);
    expect(top.tierName).toBe('Meglodon');
    expect(top.postsPerDay).toBe(14);
    expect(top.nextTierName).toBeNull();
    expect(top.nextTierPosts).toBeNull();
  });

  it('honours the username badge overrides', () => {
    expect(getPostAllowanceForBadge(0, 'maldoteth').postsPerDay).toBe(14);
  });

  it('treats a missing balance as baseline rather than throwing', () => {
    expect(getPostAllowanceForBadge(undefined).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(null).postsPerDay).toBe(1);
  });
});

describe('isWithinQuotaDay', () => {
  const now = new Date('2026-08-22T10:00:00.000Z');

  it('counts a post from earlier the same UTC day', () => {
    expect(isWithinQuotaDay('2026-08-22T00:05:00.000Z', now)).toBe(true);
  });

  it('does not count yesterday', () => {
    expect(isWithinQuotaDay('2026-08-21T23:59:59.000Z', now)).toBe(false);
  });

  it('ignores a missing or unparseable date', () => {
    expect(isWithinQuotaDay(undefined, now)).toBe(false);
    expect(isWithinQuotaDay('not a date', now)).toBe(false);
  });

  it('starts the day at UTC midnight', () => {
    expect(startOfQuotaDay(now).toISOString()).toBe('2026-08-22T00:00:00.000Z');
  });
});
