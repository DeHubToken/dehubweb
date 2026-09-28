/**
 * What each badge tier grants, in one list, for surfaces that compare tiers
 * side by side (the badge showcase, the glossary).
 *
 * Every number is read from the module that enforces it rather than copied
 * here, so a change to a quota lands in the showcase without anyone
 * remembering it exists. The one exception is the platform fee, which had no
 * shared helper: it lives here now and the glossary reads it too.
 */
import { BADGE_ORDER, badgeThresholds } from '@/lib/staking-badges';
import { getPostAllowanceForBadge } from '@/lib/post-quota';
import { engagementWeightForBadge } from '@/lib/engagement-weight';
import { getPostImageBytesForBadge, getPostImageLimitForBadge } from '@/lib/post-image-allowance';
import { getQuotaForBadge } from '@/lib/editor/quota';
import { getProfileAllowance } from '@/lib/profile-limits';

/** Fee on tips, pay-per-views, subscriptions and bounties with no badge. */
export const BASE_PLATFORM_FEE = 10;
/** Each rung climbed takes this much off the fee. */
export const FEE_STEP_PER_TIER = 0.69;
/** Megalodon's fee, rounded down from the 1.03 the step alone would give. */
export const TOP_TIER_PLATFORM_FEE = 1;

/**
 * Platform fee (percent) at a tier index; -1 is no badge. Crab already takes
 * one step off, matching the docs fee table: 10 → 9.31 → … → 1.
 */
export function platformFeeForIndex(index: number): number {
  if (index < 0) return BASE_PLATFORM_FEE;
  if (index >= BADGE_ORDER.length - 1) return TOP_TIER_PLATFORM_FEE;
  return Number((BASE_PLATFORM_FEE - (index + 1) * FEE_STEP_PER_TIER).toFixed(2));
}

/** Tiers from here up clone voices for free. */
export const FREE_VOICE_CLONING_FROM = 'Blue Whale';

export interface BadgePerks {
  /** Tier index, -1 for no badge. */
  index: number;
  tier: string | null;
  platformFee: number;
  /** Governance vote weight; 0 cannot vote. */
  voteWeight: number;
  /** What one view or reaction counts for. */
  reach: number;
  feedPostsPerDay: number;
  imagesPerPost: number;
  uploadBytesPerDay: number;
  editorStorageBytes: number;
  savedProfiles: number;
  /** Accounts this tier can lend its badge to. */
  lendingSlots: number;
  freeVoiceCloning: boolean;
}

/**
 * Perks at a tier index. The quota helpers resolve a balance, so each tier is
 * asked about at exactly its own threshold on the live ladder.
 */
export function badgePerksForIndex(index: number): BadgePerks {
  const ladder = badgeThresholds();
  const i = Math.max(-1, Math.min(index, BADGE_ORDER.length - 1));
  const tier = i >= 0 ? BADGE_ORDER[i] : null;
  const balance = i >= 0 ? ladder[i].min : 0;
  return {
    index: i,
    tier,
    platformFee: platformFeeForIndex(i),
    voteWeight: i + 1,
    reach: engagementWeightForBadge(tier),
    feedPostsPerDay: getPostAllowanceForBadge(balance).postsPerDay,
    imagesPerPost: getPostImageLimitForBadge(balance),
    uploadBytesPerDay: getPostImageBytesForBadge(balance),
    editorStorageBytes: getQuotaForBadge(balance).bytes,
    savedProfiles: getProfileAllowance([{ badgeBalance: balance }]).maxProfiles,
    lendingSlots: i + 1,
    freeVoiceCloning: i >= BADGE_ORDER.indexOf(FREE_VOICE_CLONING_FROM),
  };
}
