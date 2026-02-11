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
  { name: "Tortoise", min: 0 },
  { name: "Crab", min: 100 },
  { name: "Piranha", min: 250 },
  { name: "Lobster", min: 500 },
  { name: "Octopus", min: 1000 },
  { name: "Cobra", min: 2500 },
  { name: "Crocodite", min: 5000 },
  { name: "Dolphin", min: 7500 },
  { name: "Tiger Shark", min: 10000 },
  { name: "Great White Shark", min: 15000 },
  { name: "Killer Whale", min: 25000 },
  { name: "Blue Whale", min: 50000 },
  { name: "Meglodon", min: 100000 },
];

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
 */
export function getBadgeName(badgeBalance: number | string | undefined | null): string {
  if (badgeBalance === undefined || badgeBalance === null) {
    return BADGE_LEVELS[0].name;
  }
  
  const amt = typeof badgeBalance === "string" 
    ? parseFloat(badgeBalance) 
    : badgeBalance;
    
  if (!Number.isFinite(amt)) return BADGE_LEVELS[0].name;
  
  let current = BADGE_LEVELS[0].name;
  for (const b of BADGE_LEVELS) {
    if (amt >= b.min) current = b.name;
    else break;
  }
  return current;
}

/**
 * Get badge image URL based on badge balance (holdings + staked)
 */
export function getBadgeUrl(badgeBalance: number | string | undefined | null): string {
  const badge = getBadgeName(badgeBalance);
  return BADGE_IMAGES[badge] || BADGE_IMAGES["Tortoise"];
}

/**
 * Get badge tier info (name, min, and image)
 */
export function getBadgeInfo(badgeBalance: number | string | undefined | null): {
  name: string;
  imageUrl: string;
  minStake: number;
} {
  const name = getBadgeName(badgeBalance);
  const level = BADGE_LEVELS.find(b => b.name === name) || BADGE_LEVELS[0];
  return {
    name,
    imageUrl: BADGE_IMAGES[name] || BADGE_IMAGES["Tortoise"],
    minStake: level.min,
  };
}

/**
 * Export badge levels for reference (e.g., tooltip showing all tiers)
 */
export { BADGE_LEVELS };
