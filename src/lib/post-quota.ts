/**
 * Daily home-feed allowance — how many of an account's posts the HOME FEED
 * carries per day, derived from its DHB staking badge tier.
 *
 * This is a display rule, not a posting limit: anyone may publish as much as
 * they like, everything always shows on their profile, and followers keep
 * seeing all of it. Beyond this allowance a post simply stops appearing on
 * the general home feed.
 *
 * Everyone gets one post a day on the feed; each badge tier above that adds
 * one more — 1 (no badge) → 2 (Crab) → … → 14 (Meglodon), in the same order
 * as `BADGE_LEVELS` in `lib/staking-badges.ts`. Adding a tier there adds a
 * post here automatically; do not hand-write the numbers.
 */
import { getBadgeName, BADGE_ORDER } from "@/lib/staking-badges";

/** Feed slots per day for a wallet with no staking badge. */
export const BASELINE_FEED_POSTS_PER_DAY = 1;

export interface PostAllowanceInfo {
  /** Posts per day this wallet gets on the home feed. */
  postsPerDay: number;
  /** Badge tier the allowance came from, or "Starter" with no badge. */
  tierName: string;
  isBaseline: boolean;
}

export function getPostAllowanceForBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
): PostAllowanceInfo {
  const badge = getBadgeName(badgeBalance, username);
  // index -1 (no badge) lands on the baseline; every tier adds one.
  const index = badge ? BADGE_ORDER.indexOf(badge) : -1;

  return {
    postsPerDay: BASELINE_FEED_POSTS_PER_DAY + index + 1,
    tierName: badge ?? "Starter",
    isBaseline: index < 0,
  };
}
