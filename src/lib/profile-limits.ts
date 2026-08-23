/**
 * How many profiles one browser may keep signed in at once, from the DHB
 * staking badge tier.
 *
 * Two with no badge, and one more for every tier above it — so the ladder runs
 * 2 (no badge) → 3 (Crab) → … → 15 (Meglodon), in the same order as
 * `BADGE_LEVELS` in `lib/staking-badges.ts`. Adding a tier there adds a slot
 * here automatically; do not hand-write the numbers. Same shape, and the same
 * rule, as the daily post allowance in `lib/post-quota.ts`.
 *
 * The limit is read from the BEST tier on the device, not from whichever
 * profile happens to be active. A device's profiles belong to one person, and
 * pricing the list off the active account would mean switching to a fresh alt
 * silently dropped the limit below the number of accounts already saved —
 * which reads as the app losing accounts rather than as a tier rule.
 */
import { getBadgeName, BADGE_ORDER } from '@/lib/staking-badges';

/** Profiles a device with no staking badge may keep. */
export const BASELINE_PROFILES = 2;

/**
 * Storage backstop, independent of the tier maths: the most any tier can
 * unlock. Nothing but a corrupted list should ever reach it.
 */
export const MAX_PROFILES_CEILING = BASELINE_PROFILES + BADGE_ORDER.length;

export interface ProfileAllowance {
  /** Profiles that may be saved on this device at once. */
  maxProfiles: number;
  /** Badge tier the allowance came from, or "Starter" with no badge. */
  tierName: string;
  isBaseline: boolean;
  /** What the next tier up would allow, or null at the top. */
  nextTierName: string | null;
  nextTierProfiles: number | null;
}

function allowanceForIndex(index: number): ProfileAllowance {
  const maxProfiles = BASELINE_PROFILES + index + 1;
  const nextTierName = BADGE_ORDER[index + 1] ?? null;
  return {
    maxProfiles,
    tierName: BADGE_ORDER[index] ?? 'Starter',
    isBaseline: index < 0,
    nextTierName,
    nextTierProfiles: nextTierName ? maxProfiles + 1 : null,
  };
}

export interface BadgeHolder {
  badgeBalance?: number | string | null;
  username?: string | null;
}

/** Tier index for one holder; -1 when they hold no badge. */
function tierIndex(holder: BadgeHolder): number {
  const badge = getBadgeName(holder.badgeBalance, holder.username);
  return badge ? BADGE_ORDER.indexOf(badge) : -1;
}

/** The allowance for a whole device: the best tier any saved profile holds. */
export function getProfileAllowance(holders: BadgeHolder[]): ProfileAllowance {
  // index -1 (nobody holds a badge) lands on the baseline; every tier adds one.
  return allowanceForIndex(holders.reduce((best, h) => Math.max(best, tierIndex(h)), -1));
}
