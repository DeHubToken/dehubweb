/**
 * POVR ads — client-side constants, domain types & helpers.
 * =========================================================
 * Tier names/thresholds mirror src/lib/staking-badges.ts (canonical badge
 * system, including the historical "Crocodite"/"Meglodon" spellings) and the
 * edge copy in supabase/functions/_shared/povr.ts. CPMs are the published
 * linear POVR rates. Keep the three in sync.
 */

export interface PovrTierInfo {
  name: string;
  min: number;
  cpmUsd: number;
}

// Crypto-native pricing: CPMs scale with verified holdings (~holdings^0.65),
// anchored at Crab $100 and Meglodon $25,000. Whale tiers are effectively
// pay-per-verified-eyeball.
export const POVR_TIERS: PovrTierInfo[] = [
  { name: 'Crab', min: 10_000, cpmUsd: 100 },
  { name: 'Lobster', min: 25_000, cpmUsd: 180 },
  { name: 'Piranha', min: 50_000, cpmUsd: 285 },
  { name: 'Tortoise', min: 100_000, cpmUsd: 450 },
  { name: 'Cobra', min: 250_000, cpmUsd: 800 },
  { name: 'Octopus', min: 500_000, cpmUsd: 1_250 },
  { name: 'Crocodite', min: 1_000_000, cpmUsd: 2_000 },
  { name: 'Dolphin', min: 2_000_000, cpmUsd: 3_000 },
  { name: 'Tiger Shark', min: 3_000_000, cpmUsd: 4_000 },
  { name: 'Killer Whale', min: 5_000_000, cpmUsd: 5_500 },
  { name: 'Great White Shark', min: 10_000_000, cpmUsd: 8_750 },
  { name: 'Blue Whale', min: 25_000_000, cpmUsd: 16_000 },
  { name: 'Meglodon', min: 50_000_000, cpmUsd: 25_000 },
];

/** Users below the 10k DHB badge floor. */
export const NO_BADGE_TIER = { name: 'none', label: 'No Badge', cpmUsd: 10 };

export function tierLabel(name: string): string {
  return name === 'none' ? NO_BADGE_TIER.label : name;
}

export function tierCpmUsd(name: string): number {
  if (name === 'none') return NO_BADGE_TIER.cpmUsd;
  return POVR_TIERS.find((t) => t.name === name)?.cpmUsd ?? NO_BADGE_TIER.cpmUsd;
}

/** Blended CPM across a tier selection (empty = all tiers incl. none). */
export function blendedCpmUsd(tiers: string[]): number {
  const names = tiers.length ? tiers : ['none', ...POVR_TIERS.map((t) => t.name)];
  const sum = names.reduce((s, n) => s + tierCpmUsd(n), 0);
  return sum / names.length;
}

// ---------------------------------------------------------------------------
// Domain types (rows live outside the generated Database types — the ads
// tables ship in supabase/migrations/20260716070000_povr_ads_system.sql and
// types.ts gets regenerated out-of-band, so we type by hand here).
// ---------------------------------------------------------------------------

export type CampaignObjective = 'awareness' | 'traffic' | 'engagement';
export type CampaignStatus =
  | 'draft' | 'pending_review' | 'active' | 'paused'
  | 'rejected' | 'completed' | 'archived';
export type CreativeKind = 'image' | 'video' | 'text';
export type CreativeStatus = 'pending' | 'approved' | 'rejected';

export type AdBehavior = 'tippers' | 'ppv_buyers' | 'stakers' | 'streamers';

export interface AdTargeting {
  tiers?: string[];
  followerMin?: number;
  followerMax?: number;
  languages?: string[];
  premium?: boolean;
  communities?: string[];
  behaviors?: AdBehavior[];
  categories?: string[];
  followedCreators?: string[];
}

export interface AdAccount {
  wallet_address: string;
  company_name: string | null;
  website: string | null;
  balance_usd: number;
  total_deposited_usd: number;
  total_spent_usd: number;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface AdCampaign {
  id: string;
  wallet_address: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  review_note: string | null;
  approved_at: string | null;
  daily_budget_usd: number;
  total_budget_usd: number;
  spent_usd: number;
  start_at: string;
  end_at: string | null;
  targeting: AdTargeting;
  frequency_cap: number;
  cta_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdCreative {
  id: string;
  campaign_id: string;
  wallet_address: string;
  kind: CreativeKind;
  media_url: string | null;
  thumbnail_url: string | null;
  headline: string;
  body: string | null;
  cta_label: string;
  cta_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status: CreativeStatus;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdDailyStat {
  campaign_id: string;
  creative_id: string;
  day: string;
  impressions: number;
  clicks: number;
  spend_usd: number;
  viewer_share_usd: number;
  by_tier: Record<string, { impressions: number; clicks: number; spend: number }>;
}

export interface AdPayment {
  id: string;
  wallet_address: string;
  tx_hash: string;
  chain: 'Base' | 'BNB';
  dhb_amount: number;
  dhb_price_usd: number;
  usd_value: number;
  created_at: string;
}

/** Ad payload returned by ads-serve, ready for native feed rendering. */
export interface ServedAd {
  serveId: string;
  token: string;
  campaignId: string;
  creativeId: string;
  kind: CreativeKind;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  headline: string;
  body: string | null;
  ctaLabel: string;
  ctaUrl: string | null;
  advertiser: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface AudienceEstimate {
  audience: number;
  byTier: Record<string, number>;
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  active: 'Active',
  paused: 'Paused',
  rejected: 'Rejected',
  completed: 'Completed',
  archived: 'Archived',
};

export const AD_BEHAVIOR_OPTIONS: Array<{ value: AdBehavior; label: string; hint: string }> = [
  { value: 'tippers', label: 'Tippers', hint: 'Users who have sent tips on DeHub' },
  { value: 'ppv_buyers', label: 'PPV buyers', hint: 'Users who have purchased paid content' },
  { value: 'stakers', label: 'Stakers', hint: 'Users with DHB staking history' },
  { value: 'streamers', label: 'Streamers', hint: 'Users who have gone live' },
];

export function formatUsd(v: number | null | undefined, dp = 2): string {
  const n = Number(v ?? 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function formatCompact(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}
