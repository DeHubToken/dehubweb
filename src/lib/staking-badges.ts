/**
 * Staking Badge Utility
 * =====================
 * Determines user tier badges based on DHB token staking amount.
 * 13-tier system from Tortoise (0+) to Megalodon (100,000+).
 * 
 * @module lib/staking-badges
 */

// Badge tier definitions (ascending by min stake requirement)
interface BadgeDef {
  name: string;
  min: number;
}

const BADGE_LEVELS: BadgeDef[] = [
  { name: "Crab", min: 10000 },
  { name: "Lobster", min: 25000 },
  { name: "Piranha", min: 50000 },
  { name: "Tortoise", min: 100000 },
  { name: "Cobra", min: 250000 },
  { name: "Octopus", min: 500000 },
  { name: "Crocodite", min: 1000000 },
  { name: "Dolphin", min: 2000000 },
  { name: "Tiger Shark", min: 3000000 },
  { name: "Killer Whale", min: 5000000 },
  { name: "Great White Shark", min: 10000000 },
  { name: "Blue Whale", min: 25000000 },
  { name: "Meglodon", min: 50000000 },
];

/** Minimum DHB to qualify for any badge */
const MIN_BADGE_THRESHOLD = 10000;

/** Username-based badge overrides (always get this badge regardless of balance) */
const USERNAME_BADGE_OVERRIDES: Record<string, string> = {
  "maldoteth": "Meglodon",
};

// Import all badge images
import TortoiseBadge from '@/assets/badges/Tortoise.png';
import CrabBadge from '@/assets/badges/Crab.png';
import PiranhaBadge from '@/assets/badges/Piranha.png';
import LobsterBadge from '@/assets/badges/Lobster.png';
import OctopusBadge from '@/assets/badges/Octopus.png';
import CobraBadge from '@/assets/badges/Cobra.png';
import CrocoditeBadge from '@/assets/badges/Crocodite.png';
import DolphinBadge from '@/assets/badges/Dolphin.png';
import TigerSharkBadge from '@/assets/badges/Tiger Shark.png';
import GreatWhiteSharkBadge from '@/assets/badges/Great White Shark.png';
import KillerWhaleBadge from '@/assets/badges/Killer Whale.png';
import BlueWhaleBadge from '@/assets/badges/Blue Whale.png';
import MeglodonBadge from '@/assets/badges/Meglodon.png';

const BADGE_IMAGES: Record<string, string> = {
  "Tortoise": TortoiseBadge,
  "Crab": CrabBadge,
  "Piranha": PiranhaBadge,
  "Lobster": LobsterBadge,
  "Octopus": OctopusBadge,
  "Cobra": CobraBadge,
  "Crocodite": CrocoditeBadge,
  "Dolphin": DolphinBadge,
  "Tiger Shark": TigerSharkBadge,
  "Great White Shark": GreatWhiteSharkBadge,
  "Killer Whale": KillerWhaleBadge,
  "Blue Whale": BlueWhaleBadge,
  "Meglodon": MeglodonBadge,
};

/**
 * Get badge name based on badge balance (holdings + staked)
 * Optional username param checks for hardcoded overrides first.
 */
export function getBadgeName(badgeBalance: number | string | undefined | null, username?: string | null): string | null {
  // Check username overrides first
  if (username) {
    const clean = username.replace('@', '').toLowerCase();
    const override = USERNAME_BADGE_OVERRIDES[clean];
    if (override) return override;
  }

  if (badgeBalance === undefined || badgeBalance === null) {
    return null;
  }
  
  const amt = typeof badgeBalance === "string" 
    ? parseFloat(badgeBalance) 
    : badgeBalance;
    
  if (!Number.isFinite(amt) || amt < MIN_BADGE_THRESHOLD) return null;
  
  let current: string | null = null;
  for (const b of BADGE_LEVELS) {
    if (amt >= b.min) current = b.name;
    else break;
  }
  return current;
}

/**
 * Get badge image URL based on badge balance (holdings + staked)
 */
export function getBadgeUrl(badgeBalance: number | string | undefined | null, username?: string | null): string | null {
  const badge = getBadgeName(badgeBalance, username);
  if (!badge) return null;
  return BADGE_IMAGES[badge] || null;
}

/**
 * Get badge tier info (name, min, and image)
 */
export function getBadgeInfo(badgeBalance: number | string | undefined | null, username?: string | null): {
  name: string | null;
  imageUrl: string | null;
  minStake: number;
} {
  const name = getBadgeName(badgeBalance, username);
  if (!name) return { name: null, imageUrl: null, minStake: MIN_BADGE_THRESHOLD };
  const level = BADGE_LEVELS.find(b => b.name === name) || BADGE_LEVELS[0];
  return {
    name,
    imageUrl: BADGE_IMAGES[name] || null,
    minStake: level.min,
  };
}

/**
 * Export badge levels for reference (e.g., tooltip showing all tiers)
 */
export { BADGE_LEVELS };
