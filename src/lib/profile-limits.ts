/**
 * How many profiles one browser may keep signed in at once, from the DHB
 * staking badge tier.
 *
 * The ladder is not a formula any more. It ran 2 (no badge) → 3 (Crab) → … →
 * 15 (Meglodon), one slot per tier, which made the top of the ladder worth
 * about as much as the middle. It now opens up sharply at the top and leaves
 * the bottom exactly where it was:
 *
 *   no badge            2      Cobra … Great White Shark   10
 *   Crab                3      Blue Whale                  25
 *   Lobster             4      Meglodon                    50
 *   Piranha             5
 *   Tortoise            6
 *
 * Nobody loses a slot: every rung is at or above what it allowed before.
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
 * Profiles each tier unlocks, by name rather than by position so that
 * reordering `BADGE_LEVELS` cannot silently renumber the ladder.
 *
 * A tier missing from here inherits the nearest one below it, so adding a rung
 * to `BADGE_LEVELS` is never a crash and never a downgrade — it just does not
 * grant anything until it is given a number here.
 */
const PROFILES_BY_TIER: Record<string, number> = {
  Crab: 3,
  Lobster: 4,
  Piranha: 5,
  Tortoise: 6,
  Cobra: 10,
  Octopus: 10,
  Crocodite: 10,
  Dolphin: 10,
  'Tiger Shark': 10,
  'Killer Whale': 10,
  'Great White Shark': 10,
  'Blue Whale': 25,
  Meglodon: 50,
};

/** Profiles at a tier index, walking down to the nearest tier that names one. */
function profilesForIndex(index: number): number {
  for (let i = Math.min(index, BADGE_ORDER.length - 1); i >= 0; i--) {
    const slots = PROFILES_BY_TIER[BADGE_ORDER[i]];
    if (slots !== undefined) return slots;
  }
  return BASELINE_PROFILES;
}

/**
 * Storage backstop, independent of the tier maths: the most any tier can
 * unlock. Nothing but a corrupted list should ever reach it.
 */
export const MAX_PROFILES_CEILING = Object.values(PROFILES_BY_TIER).reduce(
  (top, slots) => Math.max(top, slots),
  BASELINE_PROFILES,
);

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
  const maxProfiles = index < 0 ? BASELINE_PROFILES : profilesForIndex(index);
  // The next rung WORTH climbing, not simply the next one along: seven tiers
  // in the middle all allow ten, and "Octopus tier keeps 10" printed under a
  // line that already says 10 reads as a bug rather than as an offer.
  let next = index + 1;
  while (next < BADGE_ORDER.length && profilesForIndex(next) <= maxProfiles) next++;
  const nextTierName = BADGE_ORDER[next] ?? null;
  return {
    maxProfiles,
    tierName: BADGE_ORDER[index] ?? 'Starter',
    isBaseline: index < 0,
    nextTierName,
    nextTierProfiles: nextTierName ? profilesForIndex(next) : null,
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
  // index -1 (nobody holds a badge) lands on the baseline; every tier reads
  // its own rung off the table.
  return allowanceForIndex(holders.reduce((best, h) => Math.max(best, tierIndex(h)), -1));
}
