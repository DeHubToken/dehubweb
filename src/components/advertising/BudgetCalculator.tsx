
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator } from 'lucide-react';
import { badgeTiers, calculateCampaignMetrics } from './utils/badgeTiers';
import CampaignInputs from './CampaignInputs';
import CampaignEstimates from './CampaignEstimates';
import BadgeTiersBreakdown from './BadgeTiersBreakdown';

const BudgetCalculator = () => {
  const [budget, setBudget] = useState(1000);
  const [targetTiers, setTargetTiers] = useState<[number, number]>([0, 0]);
  const [campaignDuration, setCampaignDuration] = useState(7);

  const selectedTiers = badgeTiers.slice(targetTiers[0], targetTiers[1] + 1);
  const calculations = calculateCampaignMetrics(budget, campaignDuration, selectedTiers);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-middle-blue" />
            Campaign Budget Calculator
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Plan your POVR advertising campaign with realistic cost estimates and audience targeting
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CampaignInputs
              budget={budget}
              setBudget={setBudget}
              campaignDuration={campaignDuration}
              setCampaignDuration={setCampaignDuration}
              targetTiers={targetTiers}
              setTargetTiers={setTargetTiers}
            />
            <CampaignEstimates calculations={calculations} />
          </div>
        </CardContent>
      </Card>

      {selectedTiers.length > 0 && calculations.totalAudience > 0 && (
        <BadgeTiersBreakdown 
          selectedTiers={selectedTiers} 
          calculations={calculations}
          budget={budget}
          campaignDuration={campaignDuration}
        />
      )}
    </div>
  );
};

export default BudgetCalculator;
