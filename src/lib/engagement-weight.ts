/**
 * What a badge is worth on a view and on a reaction
 * =================================================
 * A badge decides how much one person's attention counts. No badge counts
 * once, the entry tier twice, and every rung after that adds one: Crab 2,
 * Lobster 3, up to Meglodon 14.
 *
 * It is a MULTIPLIER, never a second reaction. One person still holds one
 * reaction and still counts as one unique viewer — the badge only changes what
 * that one is worth.
 *
 * **The server is the authority.** This exists so an optimistic count moves by
 * the right amount instead of by one and then snapping, which is the same
 * reason `useSelfBadge` exists at all. `/request_vote` and `/request_reaction`
 * both return the `weight` they actually applied; a caller that can reconcile
 * should prefer that number over this one, because the server prices from the
 * account's EARNED balance and this side cannot see the earned/lent split.
 *
 * Keep in step with `dehub-stream-backend/src/badge/engagement-weight.ts` and
 * `dehub-mobile/libs/engagement-weight.ts`. It is the same ladder as
 * governance's vote weight, shifted up by the one vote a badgeless account
 * already has — a change to one is a decision about the other.
 *
 * @module lib/engagement-weight
 */

import { BADGE_ORDER, getBadgeName, type BadgeContext } from '@/lib/staking-badges';

/** What an account with no badge contributes. Everybody counts at least once. */
export const NO_BADGE_ENGAGEMENT_WEIGHT = 1;

/** Meglodon: thirteen rungs above a badgeless account's single count. */
export const MAX_ENGAGEMENT_WEIGHT = BADGE_ORDER.length + NO_BADGE_ENGAGEMENT_WEIGHT;

/**
 * Weight for a named tier. An unknown or absent tier weighs one — a badge this
 * side does not recognise must not be worth more than one that is.
 */
export function engagementWeightForBadge(badgeName: string | null | undefined): number {
  if (!badgeName) return NO_BADGE_ENGAGEMENT_WEIGHT;
  const index = BADGE_ORDER.indexOf(badgeName);
  if (index < 0) return NO_BADGE_ENGAGEMENT_WEIGHT;
  return Math.min(MAX_ENGAGEMENT_WEIGHT, index + 1 + NO_BADGE_ENGAGEMENT_WEIGHT);
}

/**
 * Weight for a balance, resolved through the same ladder (and the same
 * grandfathering lock) that draws the badge.
 */
export function engagementWeight(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): number {
  return engagementWeightForBadge(getBadgeName(badgeBalance, username, context));
}

/** "×3", for the surfaces that tell somebody what their badge is doing. */
export function formatEngagementWeight(weight: number): string {
  return `×${Math.max(NO_BADGE_ENGAGEMENT_WEIGHT, Math.floor(weight) || 1)}`;
}
