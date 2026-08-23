import { describe, it, expect } from 'vitest';
import { getPostAllowanceForBadge } from '../post-quota';

describe('getPostAllowanceForBadge', () => {
  it('gives one feed slot a day with no badge', () => {
    expect(getPostAllowanceForBadge(undefined).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(null).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(0).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge('not-a-number').postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(9999).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(undefined).isBaseline).toBe(true);
  });

  it('adds one slot per badge tier', () => {
    expect(getPostAllowanceForBadge(10_000).postsPerDay).toBe(2); // Crab
    expect(getPostAllowanceForBadge(25_000).postsPerDay).toBe(3); // Lobster
    expect(getPostAllowanceForBadge(50_000_000).postsPerDay).toBe(14); // Meglodon
    expect(getPostAllowanceForBadge(50_000_000).isBaseline).toBe(false);
  });

  it('honours username overrides', () => {
    expect(getPostAllowanceForBadge(undefined, 'maldoteth').postsPerDay).toBe(14);
    expect(getPostAllowanceForBadge(undefined, '@mal').tierName).toBe('Meglodon');
  });
});
