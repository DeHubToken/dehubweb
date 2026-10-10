export * from './staking-badge-rules';
import { activeBadgeScale, badgeThresholds, badgeThreshold, minBadgeThreshold, canonicalTierName, getBadgeName, tierIndex, toAmount, earnedTier, type BadgeContext } from './staking-badge-rules';
// Import all badge images
import TortoiseBadge from '@/assets/badges/Giant Tortoise.webp';
import CrabBadge from '@/assets/badges/Crab.webp';
import PiranhaBadge from '@/assets/badges/Piranha.webp';
import LobsterBadge from '@/assets/badges/Ghost Lobster.webp';
import OctopusBadge from '@/assets/badges/Octopus.webp';
import CobraBadge from '@/assets/badges/King Cobra.webp';
import CrocodileBadge from '@/assets/badges/Crocodile.webp';
import DolphinBadge from '@/assets/badges/Dolphin.webp';
import TigerSharkBadge from '@/assets/badges/Tiger Shark.webp';
import GreatWhiteSharkBadge from '@/assets/badges/Great White Shark.webp';
import KillerWhaleBadge from '@/assets/badges/Killer Whale.webp';
import BlueWhaleBadge from '@/assets/badges/Blue Whale.webp';
import MegalodonBadge from '@/assets/badges/Megalodon.webp';

const BADGE_IMAGES: Record<string, string> = {
  "Giant Tortoise": TortoiseBadge,
  "Crab": CrabBadge,
  "Piranha": PiranhaBadge,
  "Ghost Lobster": LobsterBadge,
  "Octopus": OctopusBadge,
  "King Cobra": CobraBadge,
  "Crocodile": CrocodileBadge,
  "Dolphin": DolphinBadge,
  "Tiger Shark": TigerSharkBadge,
  "Great White Shark": GreatWhiteSharkBadge,
  "Killer Whale": KillerWhaleBadge,
  "Blue Whale": BlueWhaleBadge,
  "Megalodon": MegalodonBadge,
};

// The plate masks: one solid silhouette per tier — the artwork's alpha with
// every enclosed gap filled and the edge grown four percent — built by
// scripts/build-badge-plates.mjs. On light themes BadgeIcon paints an opaque
// dark plate behind the artwork masked by these rather than by the art's own
// alpha, which has transparent gaps inside the outline that would otherwise
// show the page through next to the check mark.
import TortoisePlate from '@/assets/badges/plates/Giant Tortoise.png';
import CrabPlate from '@/assets/badges/plates/Crab.png';
import PiranhaPlate from '@/assets/badges/plates/Piranha.png';
import LobsterPlate from '@/assets/badges/plates/Ghost Lobster.png';
import OctopusPlate from '@/assets/badges/plates/Octopus.png';
import CobraPlate from '@/assets/badges/plates/King Cobra.png';
import CrocodilePlate from '@/assets/badges/plates/Crocodile.png';
import DolphinPlate from '@/assets/badges/plates/Dolphin.png';
import TigerSharkPlate from '@/assets/badges/plates/Tiger Shark.png';
import GreatWhiteSharkPlate from '@/assets/badges/plates/Great White Shark.png';
import KillerWhalePlate from '@/assets/badges/plates/Killer Whale.png';
import BlueWhalePlate from '@/assets/badges/plates/Blue Whale.png';
import MegalodonPlate from '@/assets/badges/plates/Megalodon.png';

const BADGE_PLATES: Record<string, string> = {
  "Giant Tortoise": TortoisePlate,
  "Crab": CrabPlate,
  "Piranha": PiranhaPlate,
  "Ghost Lobster": LobsterPlate,
  "Octopus": OctopusPlate,
  "King Cobra": CobraPlate,
  "Crocodile": CrocodilePlate,
  "Dolphin": DolphinPlate,
  "Tiger Shark": TigerSharkPlate,
  "Great White Shark": GreatWhiteSharkPlate,
  "Killer Whale": KillerWhalePlate,
  "Blue Whale": BlueWhalePlate,
  "Megalodon": MegalodonPlate,
};

/** The plate mask for a tier, or null for a name the ladder does not know. */
export function getBadgePlateUrl(name: string | null | undefined): string | null {
  return (name && BADGE_PLATES[canonicalTierName(name) as string]) || null;
}

/**
 * Get badge image URL based on badge balance (holdings + staked)
 */
export function getBadgeUrl(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): string | null {
  const badge = getBadgeName(badgeBalance, username, context);
  if (!badge) return null;
  return BADGE_IMAGES[badge] || null;
}

/** The badge art for a tier name, for surfaces that already know the tier. */
export function badgeImage(tier: string | null | undefined): string | null {
  const name = canonicalTierName(tier);
  return name ? BADGE_IMAGES[name] ?? null : null;
}

/**
 * Get badge tier info (name, min, and image)
 */
export function getBadgeInfo(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): {
  name: string | null;
  imageUrl: string | null;
  minStake: number;
} {
  const scale = context?.scale ?? activeBadgeScale();
  const name = getBadgeName(badgeBalance, username, context);
  if (!name) return { name: null, imageUrl: null, minStake: minBadgeThreshold(scale) };
  return {
    name,
    imageUrl: BADGE_IMAGES[name] || null,
    minStake: badgeThreshold(name, scale) ?? minBadgeThreshold(scale),
  };
}

/**
 * Where a holder sits on the ladder: what they hold, what they have, and what
 * the next rung costs. The progress bar's whole data model.
 */
export interface BadgeStanding {
  /** Current tier, or null below the entry rung. */
  tier: string | null;
  /** Art for `tier`. */
  imageUrl: string | null;
  /** Index in `BADGE_ORDER`, -1 when there is no badge yet. */
  index: number;
  /** DHB counted toward the ladder. */
  balance: number;
  /** DHB the current tier costs today, or the entry rung when there is none. */
  currentThreshold: number;
  /** The next tier up, or null at Megalodon. */
  nextTier: string | null;
  /** DHB the next tier costs, or null at Megalodon. */
  nextThreshold: number | null;
  /** DHB still to buy for the next tier, 0 at the top. */
  remaining: number;
  /** Progress toward the next tier, 0–1. 1 at the top. */
  progress: number;
  /** True when the tier is held on a lock rather than on the live ladder. */
  grandfathered: boolean;
  /** The ladder scale this was resolved against. */
  scale: number;
}

/**
 * Resolve a holder's full standing.
 *
 * `progress` runs from the current rung to the next, not from zero, so the bar
 * fills across a tier rather than crawling across the whole ladder. Below the
 * entry rung it runs from zero to Crab.
 */
export function getBadgeStanding(
  badgeBalance: number | string | undefined | null,
  context?: BadgeContext,
): BadgeStanding {
  const scale = context?.scale ?? activeBadgeScale();
  const ladder = badgeThresholds(scale);
  const balance = Math.max(0, toAmount(badgeBalance) ?? 0);
  const tier = getBadgeName(badgeBalance, context?.username, context);
  const index = tierIndex(tier);

  const currentThreshold = index >= 0 ? ladder[index].min : ladder[0].min;
  const next = index + 1 < ladder.length ? ladder[index + 1] : null;

  const floor = index >= 0 ? currentThreshold : 0;
  const span = next ? next.min - floor : 0;
  const progress = next ? Math.min(1, Math.max(0, (balance - floor) / (span || 1))) : 1;

  const earned = tierIndex(earnedTier(balance, scale));

  return {
    tier,
    imageUrl: tier ? BADGE_IMAGES[tier] ?? null : null,
    index,
    balance,
    currentThreshold,
    nextTier: next?.name ?? null,
    nextThreshold: next?.min ?? null,
    remaining: next ? Math.max(0, next.min - balance) : 0,
    progress,
    grandfathered: index >= 0 && index > earned,
    scale,
  };
}

/**
 * Returns true if the badge is a shark or whale tier (excluding Megalodon) — rendered 10% larger.
 */
const BIG_BADGE_NAMES = new Set(["Tiger Shark", "Killer Whale", "Great White Shark", "Blue Whale"]);

export function isBigBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): boolean {
  const name = getBadgeName(badgeBalance, username, context);
  return name ? BIG_BADGE_NAMES.has(name) : false;
}

/** Check if a badge URL corresponds to a "big badge" tier */
const BIG_BADGE_URLS = new Set(
  Array.from(BIG_BADGE_NAMES).map(n => BADGE_IMAGES[n]).filter(Boolean)
);
export function isBigBadgeUrl(url: string | null): boolean {
  return url ? BIG_BADGE_URLS.has(url) : false;
}

/**
 * Export badge levels for reference (e.g., tooltip showing all tiers)
 *
 * These are the anchor-price numbers. Anything showing a requirement to a user
 * wants `badgeThresholds()` instead.
 */

