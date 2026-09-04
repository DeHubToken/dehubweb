/**
 * Every other leaderboard category is ranked by the API, which leaves banned
 * accounts out of its own query. This one is ranked in the browser from
 * `affiliate_referrals`, a table the API does not hold, so nothing upstream
 * could apply the ban — and an account banned for its username kept the
 * referral count that put it near the top of the board.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const referralRows = vi.hoisted(() => ({ current: [] as any[] }));
const accounts = vi.hoisted(() => ({ current: {} as Record<string, any> }));

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    limit: () => builder,
    gte: () => builder,
    then: (resolve: any) => resolve({ data: referralRows.current, error: null }),
  };
  return { supabase: { from: () => builder } };
});

vi.mock('@/lib/api/dehub', () => ({
  getAccountInfo: async (address: string) => {
    const profile = accounts.current[address];
    if (!profile) throw new Error('not found');
    return profile;
  },
}));

const { getAffiliateLeaderboard } = await import('@/lib/api/affiliate-leaderboard');

const GOOD = '0x1111111111111111111111111111111111111111';
const BANNED = '0x2222222222222222222222222222222222222222';

beforeEach(() => {
  referralRows.current = [
    { owner_address: BANNED, l2_owner_address: null, created_at: '2026-01-01T00:00:00Z' },
    { owner_address: BANNED, l2_owner_address: null, created_at: '2026-01-02T00:00:00Z' },
    { owner_address: GOOD, l2_owner_address: null, created_at: '2026-01-03T00:00:00Z' },
  ];
  accounts.current = {
    [GOOD]: { username: 'goodstanding', displayName: 'Good Standing' },
    [BANNED]: { username: 'moderated', displayName: 'Moderated', isBanned: true },
  };
});

describe('getAffiliateLeaderboard', () => {
  it('drops a banned account even though it has the most referrals', async () => {
    const entries = await getAffiliateLeaderboard('all');
    expect(entries.map((e) => e.username)).toEqual(['goodstanding']);
  });

  it('still ranks accounts whose profile does not resolve', async () => {
    accounts.current = {};
    const entries = await getAffiliateLeaderboard('all');
    expect(entries.map((e) => e.account)).toEqual([BANNED, GOOD]);
    expect(entries[0].username).toBeUndefined();
  });
});
