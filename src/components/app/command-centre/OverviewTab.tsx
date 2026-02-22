import { useTranslation } from 'react-i18next';
import { BalanceCard } from './BalanceCard';
import { IncomeChart } from './IncomeChart';
import { RecentTransactions } from './RecentTransactions';
import { SubscriptionsSummary } from './SubscriptionsSummary';
import { FundActions } from './FundActions';

export function OverviewTab() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Fund Actions */}
      <div className="flex justify-end">
        <FundActions />
      </div>

      {/* Main Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BalanceCard />
        <IncomeChart />
      </div>

      {/* Bottom Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentTransactions />
        <SubscriptionsSummary />
      </div>
    </div>
  );
}
