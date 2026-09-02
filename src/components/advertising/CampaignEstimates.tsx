
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Eye, TrendingUp, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { CampaignCalculations } from './utils/badgeTiers';

interface CampaignEstimatesProps {
  calculations: CampaignCalculations;
}

const CampaignEstimates = ({ calculations }: CampaignEstimatesProps) => {
  const { t } = useLanguage();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return Math.round(num).toLocaleString();
  };

  const reachPercentage = calculations.totalAudience > 0
    ? (calculations.estimatedReach / calculations.totalAudience * 100).toFixed(1)
    : '0';

  const ctr = calculations.estimatedImpressions > 0
    ? (calculations.estimatedClicks / calculations.estimatedImpressions * 100).toFixed(2)
    : '0';

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/20">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4" />
          {t('adTools.campaignEstimates')}
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.dailyBudgetRow')}</span>
            <Badge variant="outline" className="font-mono">
              ${calculations.dailyBudget.toFixed(2)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.totalBudgetRow')}</span>
            <Badge variant="outline" className="font-mono">
              ${calculations.totalBudget.toFixed(2)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.avgCpmRow')}</span>
            <Badge variant="outline" className="font-mono">
              ${calculations.avgCpm.toFixed(2)}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.totalAudienceRow')}</span>
            <span className="font-semibold">
              {formatNumber(calculations.totalAudience)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.estImpressionsRow')}</span>
            <span className="font-semibold">
              {formatNumber(calculations.estimatedImpressions)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.estReachRow')}</span>
            <span className="font-semibold">
              {formatNumber(calculations.estimatedReach)} ({reachPercentage}%)
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.estClicksRow')}</span>
            <span className="font-semibold">
              {formatNumber(calculations.estimatedClicks)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">{t('adTools.ctrRow')}</span>
            <Badge variant="secondary" className="font-mono">
              {ctr}%
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-4 border rounded-lg bg-gradient-to-br from-middle-blue/5 to-royal-blue/5">
        <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          {t('adTools.povrAdvantage')}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('adTools.povrAdvantageDesc')}
        </p>
      </div>

      {calculations.estimatedImpressions > 0 && (
        <div className="p-3 border rounded-lg bg-blue-50/50 border-blue-200">
          <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            {t('adTools.realisticEstimates')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('adTools.realisticEstimatesDesc')}
          </p>
        </div>
      )}
    </div>
  );
};

export default CampaignEstimates;
