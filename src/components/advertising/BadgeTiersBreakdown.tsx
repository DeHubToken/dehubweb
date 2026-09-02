
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { BadgeTier, CampaignCalculations, calculateTierBreakdowns } from './utils/badgeTiers';
import { fill } from './utils/fill';

interface BadgeTiersBreakdownProps {
  selectedTiers: BadgeTier[];
  calculations: CampaignCalculations;
  budget: number;
  campaignDuration: number;
}

const BadgeTiersBreakdown = ({
  selectedTiers,
  calculations,
  budget,
  campaignDuration
}: BadgeTiersBreakdownProps) => {
  const { t } = useLanguage();
  const tierBreakdowns = calculateTierBreakdowns(budget, campaignDuration, selectedTiers);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('adTools.budgetDistribution')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tierBreakdowns.map((breakdown) => {
            const reachPercentage = breakdown.tier.audience > 0
              ? (breakdown.reach / breakdown.tier.audience * 100).toFixed(1)
              : '0';

            return (
              <div key={breakdown.tier.name} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  {/* Tier names are the badge artwork's own names — they stay as they are. */}
                  <h3 className="font-semibold text-sm">{fill(t('adTools.tierBadge'), { tier: breakdown.tier.name })}</h3>
                  <Badge variant="outline" className="text-xs">
                    {fill(t('adTools.cpmValue'), { amount: `$${breakdown.tier.cpm}` })}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{t('adTools.budgetAllocatedRow')}</span>
                    <span className="font-semibold text-foreground">
                      ${breakdown.budgetAllocated.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.audienceSizeRow')}</span>
                    <span>{formatNumber(breakdown.tier.audience)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.estImpressionsRow')}</span>
                    <span>{formatNumber(breakdown.impressions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.estReachRow')}</span>
                    <span>{formatNumber(breakdown.reach)} ({reachPercentage}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default BadgeTiersBreakdown;
