
export interface BadgeTier {
  name: string;
  cpm: number;
  audience: number;
  holdings: string;
}

export const badgeTiers: BadgeTier[] = [
  { name: 'No Badge', cpm: 2.50, audience: 500000, holdings: '< 10,000' },
  { name: 'Crab', cpm: 5.00, audience: 100000, holdings: '10k+' },
  { name: 'Lobster', cpm: 7.50, audience: 50000, holdings: '25k+' },
  { name: 'Piranha', cpm: 10.00, audience: 25000, holdings: '50k+' },
  { name: 'Tortoise', cpm: 12.50, audience: 15000, holdings: '100k+' },
  { name: 'Cobra', cpm: 15.00, audience: 8000, holdings: '250k+' },
  { name: 'Octopus', cpm: 17.50, audience: 4000, holdings: '500k+' },
  { name: 'Crocodile', cpm: 20.00, audience: 2000, holdings: '1m+' },
  { name: 'Dolphin', cpm: 22.50, audience: 1000, holdings: '2.5m+' },
  { name: 'Tiger Shark', cpm: 25.00, audience: 500, holdings: '5m+' },
  { name: 'Killer Whale', cpm: 27.50, audience: 250, holdings: '7.5m+' },
  { name: 'Great White', cpm: 30.00, audience: 100, holdings: '10m+' },
  { name: 'Blue Whale', cpm: 32.50, audience: 50, holdings: '25m+' },
  { name: 'Megalodon', cpm: 35.00, audience: 25, holdings: '50m+' }
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
