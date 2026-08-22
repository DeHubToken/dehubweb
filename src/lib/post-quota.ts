/**
 * Daily post allowance — how many posts a wallet may put on the main feed in
 * one day, derived from its DHB staking badge tier.
 *
 * Everyone gets one post a day. Each badge tier above that unlocks one more,
 * so the ladder runs 1 (no badge) → 2 (Crab) → … → 14 (Meglodon), in the same
 * order as `BADGE_LEVELS` in `lib/staking-badges.ts`. Adding a tier there adds
 * a post here automatically; do not hand-write the numbers.
 *
 * Display and client-side gate only — the server is still the authority on
 * what actually publishes.
 */
import { getBadgeName, BADGE_ORDER } from "@/lib/staking-badges";

/** Posts per day for a wallet with no staking badge. */
export const BASELINE_POSTS_PER_DAY = 1;

export interface PostAllowanceInfo {
  /** Total posts this wallet may publish today. */
  postsPerDay: number;
  /** Badge tier the allowance came from, or "Starter" with no badge. */
  tierName: string;
  isBaseline: boolean;
  /** Posts the next tier up would allow, or null at the top. */
  nextTierPosts: number | null;
  nextTierName: string | null;
}

export function getPostAllowanceForBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
): PostAllowanceInfo {
  const badge = getBadgeName(badgeBalance, username);
  const index = badge ? BADGE_ORDER.indexOf(badge) : -1;

  // index -1 (no badge) lands on the baseline; every tier adds one.
  const postsPerDay = BASELINE_POSTS_PER_DAY + index + 1;
  const nextName = BADGE_ORDER[index + 1] ?? null;

  return {
    postsPerDay,
    tierName: badge ?? "Starter",
    isBaseline: index < 0,
    nextTierName: nextName,
    nextTierPosts: nextName ? postsPerDay + 1 : null,
  };
}

/** Start of the current quota day, in UTC — the boundary the counts use. */
export function startOfQuotaDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** True when `iso` falls inside the current quota day. */
export function isWithinQuotaDay(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= startOfQuotaDay(now).getTime();
}

/** Human label for when the next allowance lands, e.g. "in 3h 20m". */
export function formatQuotaReset(now: Date = new Date()): string {
  const reset = startOfQuotaDay(now).getTime() + 24 * 60 * 60 * 1000;
  const mins = Math.max(1, Math.round((reset - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
