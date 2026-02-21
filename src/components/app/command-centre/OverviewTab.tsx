import { BalanceCard } from './BalanceCard';
import { IncomeChart } from './IncomeChart';
import { RecentTransactions } from './RecentTransactions';
import { SubscriptionsSummary } from './SubscriptionsSummary';
import { FundActions } from './FundActions';

export function OverviewTab() {
  return (
    <div className="space-y-4">
      {/* Top Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Overview</h2>
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
