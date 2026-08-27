/**
 * Community stats
 * ===============
 * Reads api.dehub.io/api/stats/users — the public, unauthenticated endpoint
 * that counts members, active users and signups straight out of the platform
 * database. It is the same arithmetic the admin dashboard runs, published
 * without a login, so the number on /stats and the number in godmode are the
 * same number.
 *
 * Companion to use-site-stats, which reads traffic measured at Cloudflare's
 * edge. That one counts requests; this one counts people with accounts.
 */

import { useQuery } from '@tanstack/react-query';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';

export interface UserStatsHistoryDay {
  date: string;
  newUsers: number;
  registered: number;
  /** Registered accounts plus the legacy baseline, cumulative to this day. */
  total: number;
  /** `null` on every day before active users started being recorded. */
  activeDaily: number | null;
  activeWeekly: number | null;
  activeMonthly: number | null;
}

export interface UserStats {
  ok: true;
  fetchedAt: string;
  totals: { total: number; registered: number; legacy: number; banned: number };
  active: { daily: number; weekly: number; monthly: number };
  newUsers: { today: number; thisWeek: number; thisMonth: number; thisYear: number; allTime: number };
  /** Percent growth on the registered base. `null` where it is not measurable. */
  growth: {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
    yearly: number | null;
  };
  history: {
    /** First day anyone ever joined. */
    since: string | null;
    /** First day active users were recorded — the active lines start here. */
    activeSince: string | null;
    days: UserStatsHistoryDay[];
  };
  provenance: {
    source: string;
    collections: string[];
    timezone: 'UTC';
    activeDefinition: string;
    growthFormula: string;
    note: string;
  };
}

export const USER_STATS_ENDPOINT = `${DEHUB_API_BASE}/api/stats/users`;

async function fetchUserStats(): Promise<UserStats> {
  const res = await fetch(USER_STATS_ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`user stats endpoint returned ${res.status}`);

  const body = (await res.json()) as UserStats;
  if (!body || body.ok !== true) throw new Error('user stats endpoint returned an unexpected shape');
  return body;
}

export function useUserStats() {
  return useQuery({
    queryKey: ['user-stats'],
    queryFn: fetchUserStats,
    // Matches the endpoint's own 60s cache — polling faster only re-reads the
    // same memoised answer.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 45_000,
    retry: 1,
  });
}
