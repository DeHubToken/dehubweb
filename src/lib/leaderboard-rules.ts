/**
 * Leaderboard rules.
 * ==================
 * The page, the sidebar widget and the home-feed carousel all draw the same
 * cache rows, and for a long time each applied its own copy of the filters and
 * overrides — so the carousel skipped a balance override the page applied, and
 * a rank was whatever index a row happened to land on after a search filter or
 * a direction toggle. Everything that decides who is on a board, in what
 * order, and with what number lives here so the three surfaces cannot drift.
 *
 * Ranks are assigned here, on the entry, before any caller filters or
 * reverses the list: rank 400 stays rank 400 when it is the only search hit.
 */

import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardSortMode } from '@/lib/api/dehub';

/** Every board the API serves, plus the Supabase-aggregated referral board. */
export type LeaderboardRuleSort = LeaderboardSortMode | 'affiliates';

/** Usernames that never appear on any board (staff and service accounts). */
export const BLOCKED_LEADERBOARD_USERS: readonly string[] = ['dehubdev1', 'uss', 'support'];

/** Manual balance overrides, keyed on lowercase username. Holdings, all-time only. */
export const BALANCE_OVERRIDES: Record<string, number> = {
  maldoteth: 273298163.18321,
};

export interface LeaderboardRuleOptions {
  sort: LeaderboardRuleSort;
  period: LeaderboardPeriod;
}

export type RankedEntry<T extends LeaderboardEntry = LeaderboardEntry> = T & { rank: number };

/** A row whose owner hid their balance: no number, no badge. */
export function isHidden(entry: LeaderboardEntry): boolean {
  return entry.total === null || entry.hideBadgeAndBalance === true;
}

/** The absolute metric a board ranks on, regardless of period. */
export function getAbsoluteValue(entry: LeaderboardEntry, sort: LeaderboardRuleSort): number {
  switch (sort) {
    case 'affiliates':
      return (entry as LeaderboardEntry & { directReferrals?: number }).directReferrals ?? 0;
    case 'sentTips':
      return entry.sentTips ?? 0;
    case 'receivedTips':
      return entry.receivedTips ?? 0;
    case 'followers':
      return entry.followers ?? 0;
    case 'likes':
      return entry.likes ?? 0;
    case 'subscribers':
      return entry.subscribers ?? 0;
    default:
      return entry.total ?? 0;
  }
}

/**
 * The number a row shows: the period's delta on a day/week/month/year board,
 * the absolute metric on the all-time board. A period row with no delta is 0
 * here — it never falls back to the all-time figure, which would put two
 * different quantities in one column. Affiliates carry no delta series and
 * always show the direct-referral count.
 */
export function getEntryValue(entry: LeaderboardEntry, sort: LeaderboardRuleSort, period: LeaderboardPeriod): number {
  if (sort === 'affiliates') return getAbsoluteValue(entry, sort);
  if (period !== 'all') return entry.delta ?? 0;
  return getAbsoluteValue(entry, sort);
}

/** Whether a period board has any row that shows a delta at all. */
export function hasDelta(entry: LeaderboardEntry, sort: LeaderboardRuleSort, period: LeaderboardPeriod): boolean {
  if (sort === 'affiliates' || period === 'all') return true;
  return typeof entry.delta === 'number';
}

/**
 * Filter, override, sort and rank a raw cache list.
 *
 * - Wallet-only rows (no username) are dropped, except on the affiliates
 *   board: a referrer who never set a handle still brought people in, and
 *   dropping them would silently rewrite the ranks.
 * - Blocked usernames are dropped everywhere.
 * - Balance overrides apply only to the all-time holdings board — the override
 *   is a DHB balance and would be nonsense as a referral count or a delta.
 * - Ordering is by the displayed value, highest first. Callers that offer a
 *   direction toggle reverse the returned list; they never re-rank it.
 */
export function applyLeaderboardRules<T extends LeaderboardEntry>(
  entries: readonly T[] | undefined | null,
  { sort, period }: LeaderboardRuleOptions,
): RankedEntry<T>[] {
  const isAffiliates = sort === 'affiliates';

  let list: T[] = (entries ?? []).filter((entry) => {
    const uname = entry.username?.toLowerCase();
    if (uname && BLOCKED_LEADERBOARD_USERS.includes(uname)) return false;
    return isAffiliates ? true : Boolean(entry.username);
  });

  if (sort === 'holdings' && period === 'all') {
    list = list.map((entry) => {
      const override = entry.username ? BALANCE_OVERRIDES[entry.username.toLowerCase()] : undefined;
      if (override === undefined || isHidden(entry)) return entry;
      return { ...entry, total: override };
    });
  }

  const sorted = [...list].sort((a, b) => getEntryValue(b, sort, period) - getEntryValue(a, sort, period));

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** `1.2M`, `3.4K`, or the locale-formatted integer. */
export function formatLeaderboardNumber(num: number | null | undefined): string {
  if (num === undefined || num === null || Number.isNaN(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}
