
export interface BadgeTier {
  name: string;
  cpm: number;
  audience: number;
  holdings: string;
}

// Names + thresholds mirror the canonical badge system in
// src/lib/staking-badges.ts and the live POVR pricing in src/lib/ads/povr.ts.
// `audience` values are illustrative for the docs calculator only — the real
// portal (/app/ads) estimates audiences live from holdings snapshots.
export const badgeTiers: BadgeTier[] = [
  { name: 'No Badge', cpm: 10, audience: 500000, holdings: '< 10,000' },
  { name: 'Crab', cpm: 100, audience: 100000, holdings: '10k+' },
  { name: 'Lobster', cpm: 180, audience: 50000, holdings: '25k+' },
  { name: 'Piranha', cpm: 285, audience: 25000, holdings: '50k+' },
  { name: 'Tortoise', cpm: 450, audience: 15000, holdings: '100k+' },
  { name: 'Cobra', cpm: 800, audience: 8000, holdings: '250k+' },
  { name: 'Octopus', cpm: 1250, audience: 4000, holdings: '500k+' },
  { name: 'Crocodite', cpm: 2000, audience: 2000, holdings: '1m+' },
  { name: 'Dolphin', cpm: 3000, audience: 1000, holdings: '2m+' },
  { name: 'Tiger Shark', cpm: 4000, audience: 500, holdings: '3m+' },
  { name: 'Killer Whale', cpm: 5500, audience: 250, holdings: '5m+' },
  { name: 'Great White Shark', cpm: 8750, audience: 100, holdings: '10m+' },
  { name: 'Blue Whale', cpm: 16000, audience: 50, holdings: '25m+' },
  { name: 'Meglodon', cpm: 25000, audience: 25, holdings: '50m+' }
];

export interface CampaignCalculations {
  totalAudience: number;
  avgCpm: number;
  dailyBudget: number;
  totalBudget: number;
  estimatedImpressions: number;
  estimatedClicks: number;
  estimatedReach: number;
}

export interface TierBreakdown {
  tier: BadgeTier;
  budgetAllocated: number;
  impressions: number;
  reach: number;
}

export const calculateCampaignMetrics = (
  dailyBudget: number,
  campaignDuration: number,
  selectedTiers: BadgeTier[]
): CampaignCalculations => {
  const effectiveDuration = Math.max(campaignDuration, 1);
  const totalBudget = dailyBudget * effectiveDuration;
  
  if (dailyBudget <= 0 || selectedTiers.length === 0) {
    return {
      totalAudience: 0,
      avgCpm: 0,
      dailyBudget: 0,
      totalBudget: 0,
      estimatedImpressions: 0,
      estimatedClicks: 0,
      estimatedReach: 0
    };
  }

  const totalAudience = selectedTiers.reduce((sum, tier) => sum + tier.audience, 0);
  const avgCpm = selectedTiers.reduce((sum, tier) => sum + tier.cpm, 0) / selectedTiers.length;

  // Realistic frequency caps per day
  const maxDailyFrequency = 4;
  const maxPossibleDailyImpressions = totalAudience * maxDailyFrequency;
  const maxPossibleTotalImpressions = maxPossibleDailyImpressions * effectiveDuration;

  // Distribute daily budget proportionally across tiers based on audience size
  const totalWeight = selectedTiers.reduce((sum, tier) => sum + tier.audience, 0);
  let totalImpressions = 0;
  let totalReach = 0;

  for (const tier of selectedTiers) {
    const tierWeight = tier.audience / totalWeight;
    const tierDailyBudget = dailyBudget * tierWeight;
    const tierTotalBudget = tierDailyBudget * effectiveDuration;
    
    // Calculate impressions for this tier over the entire campaign
    const tierTheoreticalImpressions = (tierTotalBudget / tier.cpm) * 1000;
    const tierMaxImpressions = tier.audience * maxDailyFrequency * effectiveDuration;
    const tierImpressions = Math.min(tierTheoreticalImpressions, tierMaxImpressions);
    
    totalImpressions += tierImpressions;
    
    // Calculate reach for this tier (unique people reached over campaign duration)
    const avgImpressionsPerPerson = tierImpressions / tier.audience;
    const reachPercentage = Math.min(avgImpressionsPerPerson / (maxDailyFrequency * 0.7), 1);
    const tierReach = tier.audience * reachPercentage;
    
    totalReach += tierReach;
  }

  // Ensure totals don't exceed realistic limits
  const finalImpressions = Math.min(totalImpressions, maxPossibleTotalImpressions);
  const finalReach = Math.min(totalReach, totalAudience);

  // Realistic CTR: 0.8%
  const estimatedClicks = finalImpressions * 0.008;

  return {
    totalAudience,
    avgCpm,
    dailyBudget,
    totalBudget,
    estimatedImpressions: finalImpressions,
    estimatedClicks,
    estimatedReach: finalReach
  };
};

export const calculateTierBreakdowns = (
  dailyBudget: number,
  campaignDuration: number,
  selectedTiers: BadgeTier[]
): TierBreakdown[] => {
  const effectiveDuration = Math.max(campaignDuration, 1);
  const totalBudget = dailyBudget * effectiveDuration;
  const maxDailyFrequency = 4;
  
  if (dailyBudget <= 0 || selectedTiers.length === 0) {
    return [];
  }

  const totalWeight = selectedTiers.reduce((sum, tier) => sum + tier.audience, 0);
  
  return selectedTiers.map(tier => {
    const tierWeight = tier.audience / totalWeight;
    const tierDailyBudget = dailyBudget * tierWeight;
    const tierTotalBudget = tierDailyBudget * effectiveDuration;
    
    // Calculate impressions for this tier over the entire campaign
    const tierTheoreticalImpressions = (tierTotalBudget / tier.cpm) * 1000;
    const tierMaxImpressions = tier.audience * maxDailyFrequency * effectiveDuration;
    const tierImpressions = Math.min(tierTheoreticalImpressions, tierMaxImpressions);
    
    // Calculate reach for this tier
    const avgImpressionsPerPerson = tierImpressions / tier.audience;
    const reachPercentage = Math.min(avgImpressionsPerPerson / (maxDailyFrequency * 0.7), 1);
    const tierReach = tier.audience * reachPercentage;
    
    return {
      tier,
      budgetAllocated: tierTotalBudget,
      impressions: tierImpressions,
      reach: tierReach
    };
  });
};
