
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { badgeTiers } from './utils/badgeTiers';

interface CampaignInputsProps {
  budget: number;
  setBudget: (budget: number) => void;
  campaignDuration: number;
  setCampaignDuration: (duration: number) => void;
  targetTiers: [number, number];
  setTargetTiers: (tiers: [number, number]) => void;
}

const CampaignInputs = ({
  budget,
  setBudget,
  campaignDuration,
  setCampaignDuration,
  targetTiers,
  setTargetTiers
}: CampaignInputsProps) => {
  const selectedTiers = badgeTiers.slice(targetTiers[0], targetTiers[1] + 1);
  const totalAudience = selectedTiers.reduce((sum, tier) => sum + tier.audience, 0);
  const totalBudget = budget * campaignDuration;
  
  // Warning conditions
  const showAudienceWarning = totalAudience < 1000 && budget > 100;
  const showBudgetWarning = budget > 1000 && totalAudience < 10000;

  const handleTierRangeChange = (value: number[]) => {
    const [start, end] = value;
    setTargetTiers([Math.min(start, end), Math.max(start, end)]);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="budget">Daily Budget ($)</Label>
        <Input
          id="budget"
          type="number"
          value={budget}
          onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
          className="mt-1"
          min="0"
          step="10"
        />
        {campaignDuration > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            Total campaign budget: ${totalBudget.toFixed(2)}
          </p>
        )}
      </div>

      <div>
        <Label>Campaign Duration (days)</Label>
        <div className="mt-2 px-2">
          <Slider
            value={[campaignDuration]}
            onValueChange={(value) => setCampaignDuration(value[0])}
            max={30}
            min={1}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground mt-1">
            <span>1 day</span>
            <span className="font-semibold">{campaignDuration} days</span>
            <span>30 days</span>
          </div>
        </div>
      </div>

      <div>
        <Label>Target Badge Tiers (Range)</Label>
        <div className="mt-2 px-2">
          <Slider
            value={targetTiers}
            onValueChange={handleTierRangeChange}
            max={13}
            min={0}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground mt-1">
            <span>{badgeTiers[targetTiers[0]]?.name || 'No Badge'}</span>
            <span className="font-semibold">
              {selectedTiers.length} tier{selectedTiers.length !== 1 ? 's' : ''} selected
            </span>
            <span>{badgeTiers[targetTiers[1]]?.name || 'No Badge'}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Total audience: {totalAudience.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {showAudienceWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Small audience ({totalAudience.toLocaleString()}) for this budget. Consider targeting more tiers or reducing budget.
          </AlertDescription>
        </Alert>
      )}

      {showBudgetWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            High daily budget (${budget.toFixed(2)}) for this audience size. Results may not be realistic.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default CampaignInputs;
