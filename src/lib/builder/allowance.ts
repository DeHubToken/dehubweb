/**
 * Builder build allowance — maps a user's DHB staking badge tier to their
 * daily AI app-build allowance. Display-side mirror of the authoritative
 * table in supabase/functions/builder-api/index.ts (keep the two in sync).
 */
import { getBadgeName } from "@/lib/staking-badges";

/** Ordered from highest to lowest tier. First match wins from top. */
const BUILDS_BY_BADGE: Array<{ name: string; builds: number }> = [
  { name: "Meglodon", builds: 120 },
  { name: "Blue Whale", builds: 90 },
  { name: "Great White Shark", builds: 75 },
  { name: "Killer Whale", builds: 60 },
  { name: "Tiger Shark", builds: 50 },
  { name: "Dolphin", builds: 40 },
  { name: "Crocodite", builds: 30 },
  { name: "Octopus", builds: 25 },
  { name: "Cobra", builds: 20 },
  { name: "Tortoise", builds: 15 },
  { name: "Piranha", builds: 10 },
  { name: "Lobster", builds: 8 },
  { name: "Crab", builds: 5 },
];

/** Baseline for wallets with no staking badge. */
const BASELINE_BUILDS = 3;

export interface BuilderAllowanceInfo {
  buildsPerDay: number;
  tierName: string;
  isBaseline: boolean;
}

export function getBuilderAllowanceForBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
): BuilderAllowanceInfo {
  const badge = getBadgeName(badgeBalance, username);
  if (badge) {
    const match = BUILDS_BY_BADGE.find((q) => q.name === badge);
    if (match) return { buildsPerDay: match.builds, tierName: badge, isBaseline: false };
  }
  return { buildsPerDay: BASELINE_BUILDS, tierName: "Starter", isBaseline: true };
}
