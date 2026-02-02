/**
 * Staking Badge Utility
 * =====================
 * Determines user tier badges based on DHB token holdings.
 * 13-tier system from Crab (10,000+) to Megalodon (50,000,000+).
 * Users with holdings below 10,000 DHB have NO badge.
 * 
 * @module lib/staking-badges
 */

// Badge tier definitions (ascending by min holdings requirement)
interface BadgeDef {
  name: string;
  min: number;
}

const BADGE_LEVELS: BadgeDef[] = [
  { name: "Crab", min: 10_000 },
  { name: "Lobster", min: 25_000 },
  { name: "Piranha", min: 50_000 },
  { name: "Tortoise", min: 100_000 },
  { name: "Cobra", min: 250_000 },
  { name: "Octopus", min: 500_000 },
  { name: "Crocodite", min: 1_000_000 },
  { name: "Dolphin", min: 2_000_000 },
  { name: "Tiger Shark", min: 3_000_000 },
  { name: "Killer Whale", min: 5_000_000 },
  { name: "Great White Shark", min: 10_000_000 },
  { name: "Blue Whale", min: 25_000_000 },
  { name: "Meglodon", min: 50_000_000 },
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
 * Get badge name based on holdings amount
 * Returns null if user doesn't qualify for any badge
 */
export function getBadgeName(holdingsAmount: number | string | undefined | null): string | null {
  if (holdingsAmount === undefined || holdingsAmount === null) {
    return null;
  }
  
  const amt = typeof holdingsAmount === "string" 
    ? parseFloat(holdingsAmount) 
    : holdingsAmount;
    
  if (!Number.isFinite(amt) || amt < BADGE_LEVELS[0].min) {
    return null;
  }
  
  let current: string | null = null;
  for (const b of BADGE_LEVELS) {
    if (amt >= b.min) current = b.name;
    else break;
  }
  return current;
}

/**
 * Get badge image URL based on holdings amount
 * Returns null if user doesn't qualify for any badge
 */
export function getBadgeUrl(holdingsAmount: number | string | undefined | null): string | null {
  const badge = getBadgeName(holdingsAmount);
  if (!badge) return null;
  return BADGE_IMAGES[badge] || null;
}

/**
 * Get badge tier info (name, min, and image)
 * Returns null if user doesn't qualify for any badge
 */
export function getBadgeInfo(holdingsAmount: number | string | undefined | null): {
  name: string;
  imageUrl: string;
  minHoldings: number;
} | null {
  const name = getBadgeName(holdingsAmount);
  if (!name) return null;
  
  const level = BADGE_LEVELS.find(b => b.name === name);
  if (!level) return null;
  
  return {
    name,
    imageUrl: BADGE_IMAGES[name] || "",
    minHoldings: level.min,
  };
}

/**
 * Export badge levels for reference (e.g., tooltip showing all tiers)
 */
export { BADGE_LEVELS };
