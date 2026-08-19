/**
 * Affiliate Leaderboard
 * =====================
 * Ranks accounts by how many people they brought to DeHub.
 *
 * Every other leaderboard category is served by `/api/leaderboard` on
 * api.dehub.io, but referrals aren't in that database — they live in Supabase
 * as `affiliate_referrals`, one row per referred wallet. So this category is
 * aggregated client-side and then shaped into the same `LeaderboardEntry` the
 * page already renders, which keeps the row markup, search and sort toggle
 * untouched.
 *
 * Two counts come out of one table:
 *   - direct    — rows where the account is `owner_address` (tier 1)
 *   - secondary — rows where it is `l2_owner_address`, i.e. someone their own
 *                 referral went on to refer (tier 2)
 *
 * The table is public-SELECT by policy and small (tens of rows), so pulling it
 * whole and counting in memory is cheaper than a round trip per account. The
 * cap below is a guard for the day it isn't small, not a current limit.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAccountInfo } from '@/lib/api/dehub';
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/api/dehub';

/** Referral rows read per request. Well above the live row count. */
const MAX_REFERRAL_ROWS = 10_000;

/** Accounts whose profile is resolved. Beyond this a row still ranks, it just shows its address. */
const MAX_PROFILE_LOOKUPS = 50;

const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export interface AffiliateLeaderboardEntry extends LeaderboardEntry {
  /** People this account referred itself. */
  directReferrals: number;
  /** People referred by someone this account referred. */
  secondaryReferrals: number;
}

function periodStart(period: LeaderboardPeriod): string | null {
  if (period === 'all') return null;
  const days = PERIOD_DAYS[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getAffiliateLeaderboard(
  period: LeaderboardPeriod = 'all'
): Promise<AffiliateLeaderboardEntry[]> {
  let query = supabase
    .from('affiliate_referrals')
    .select('owner_address, l2_owner_address, created_at')
    .limit(MAX_REFERRAL_ROWS);

  const since = periodStart(period);
  if (since) query = query.gte('created_at', since);

  const { data, error } = await query;
  if (error) throw error;

  const direct = new Map<string, number>();
  const secondary = new Map<string, number>();

  for (const row of data ?? []) {
    // Addresses are stored however the referring client wrote them, so fold
    // case before counting or one owner ranks as two.
    const owner = row.owner_address?.toLowerCase();
    if (owner) direct.set(owner, (direct.get(owner) ?? 0) + 1);

    const l2 = row.l2_owner_address?.toLowerCase();
    // A self-referral chain would otherwise credit the same account twice for
    // one signup.
    if (l2 && l2 !== owner) secondary.set(l2, (secondary.get(l2) ?? 0) + 1);
  }

  const accounts = new Set<string>([...direct.keys(), ...secondary.keys()]);

  const ranked = [...accounts]
    .map((account) => ({
      account,
      directReferrals: direct.get(account) ?? 0,
      secondaryReferrals: secondary.get(account) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.directReferrals - a.directReferrals ||
        b.secondaryReferrals - a.secondaryReferrals
    );

  // Resolve handles for the accounts that will actually be looked at. A
  // profile miss is not an error here — the row falls back to a short address,
  // the same as any wallet-only entry elsewhere on the page.
  const resolvable = ranked.slice(0, MAX_PROFILE_LOOKUPS);
  const profiles = await Promise.all(
    resolvable.map(async (row) => {
      try {
        return await getAccountInfo(row.account);
      } catch {
        return null;
      }
    })
  );

  return ranked.map((row, index) => {
    const profile = index < profiles.length ? profiles[index] : null;
    return {
      account: row.account,
      total: row.directReferrals,
      username: profile?.username ?? undefined,
      userDisplayName: profile?.displayName ?? undefined,
      avatarUrl: profile?.avatarImageUrl ?? undefined,
      sentTips: 0,
      receivedTips: 0,
      directReferrals: row.directReferrals,
      secondaryReferrals: row.secondaryReferrals,
    };
  });
}
