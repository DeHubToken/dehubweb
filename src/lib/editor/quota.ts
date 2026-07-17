/**
 * Editor storage quota — maps a user's staking badge tier to their
 * cloud storage allowance for imported editor media.
 */
import { getBadgeName } from "@/lib/staking-badges";

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/** Ordered from lowest to highest tier. First match wins from top. */
const QUOTA_BY_BADGE: Array<{ name: string; bytes: number }> = [
  { name: "Meglodon", bytes: 5 * 1024 * GB },
  { name: "Blue Whale", bytes: 1536 * GB },
  { name: "Great White Shark", bytes: 750 * GB },
  { name: "Killer Whale", bytes: 400 * GB },
  { name: "Tiger Shark", bytes: 200 * GB },
  { name: "Dolphin", bytes: 100 * GB },
  { name: "Crocodite", bytes: 50 * GB },
  { name: "Octopus", bytes: 25 * GB },
  { name: "Cobra", bytes: 15 * GB },
  { name: "Tortoise", bytes: 8 * GB },
  { name: "Piranha", bytes: 4 * GB },
  { name: "Lobster", bytes: 2 * GB },
  { name: "Crab", bytes: 1 * GB },
];

/** Baseline for wallets with no staking badge. */
const BASELINE_BYTES = 500 * MB;

export interface QuotaInfo {
  bytes: number;
  tierName: string;
  isBaseline: boolean;
}

export function getQuotaForBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
): QuotaInfo {
  const badge = getBadgeName(badgeBalance, username);
  if (badge) {
    const match = QUOTA_BY_BADGE.find((q) => q.name === badge);
    if (match) return { bytes: match.bytes, tierName: badge, isBaseline: false };
  }
  return { bytes: BASELINE_BYTES, tierName: "Starter", isBaseline: true };
}

/** Human-readable byte count (KB / MB / GB / TB) with 1 decimal. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const decimals = i >= 3 ? 2 : n >= 100 ? 0 : 1;
  return `${n.toFixed(decimals)} ${units[i]}`;
}
