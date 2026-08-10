import { describe, it, expect } from 'vitest';
import {
  isNewMember,
  accountAgeInDays,
  newMemberLabel,
  NEW_MEMBER_DAYS,
} from '@/lib/new-member';

const NOW = new Date('2026-08-10T00:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe('isNewMember', () => {
  it('is true inside the window', () => {
    expect(isNewMember({ createdAt: daysAgo(0) }, NOW)).toBe(true);
    expect(isNewMember({ createdAt: daysAgo(29) }, NOW)).toBe(true);
  });

  it('is false on and after the boundary', () => {
    expect(isNewMember({ createdAt: daysAgo(NEW_MEMBER_DAYS) }, NOW)).toBe(false);
    expect(isNewMember({ createdAt: daysAgo(400) }, NOW)).toBe(false);
  });

  it('accepts the snake_case field too', () => {
    expect(isNewMember({ created_at: daysAgo(1) }, NOW)).toBe(true);
  });

  // Treating "unknown" as "brand new" would badge every existing account the
  // first time the API stops returning the field.
  it('is false when the date is missing or unparseable', () => {
    expect(isNewMember({}, NOW)).toBe(false);
    expect(isNewMember(null, NOW)).toBe(false);
    expect(isNewMember(undefined, NOW)).toBe(false);
    expect(isNewMember({ createdAt: 'not a date' }, NOW)).toBe(false);
    expect(isNewMember({ createdAt: null }, NOW)).toBe(false);
  });

  it('treats a future date as brand new rather than negative', () => {
    expect(accountAgeInDays({ createdAt: daysAgo(-5) }, NOW)).toBe(0);
    expect(isNewMember({ createdAt: daysAgo(-5) }, NOW)).toBe(true);
  });
});

describe('accountAgeInDays', () => {
  it('measures whole and partial days', () => {
    expect(accountAgeInDays({ createdAt: daysAgo(3) }, NOW)).toBeCloseTo(3);
    expect(accountAgeInDays({ createdAt: daysAgo(0.5) }, NOW)).toBeCloseTo(0.5);
  });

  it('returns null without a date', () => {
    expect(accountAgeInDays({}, NOW)).toBeNull();
  });
});

describe('newMemberLabel', () => {
  it('reads naturally at the edges', () => {
    expect(newMemberLabel({ createdAt: daysAgo(0) }, NOW)).toBe('Joined today');
    expect(newMemberLabel({ createdAt: daysAgo(1) }, NOW)).toBe('Joined yesterday');
    expect(newMemberLabel({ createdAt: daysAgo(9) }, NOW)).toBe('Joined 9 days ago');
  });

  it('is null without a date', () => {
    expect(newMemberLabel({}, NOW)).toBeNull();
  });
});

// The live API returns this shape; captured from GET /api/account_info/lcs_game.
describe('against a real API payload', () => {
  it('reads createdAt from the account_info response', () => {
    const account = { username: 'lcs_game', createdAt: '2026-03-03T06:02:13.833Z' };
    expect(accountAgeInDays(account, NOW)).toBeGreaterThan(150);
    expect(isNewMember(account, NOW)).toBe(false);
  });
});
