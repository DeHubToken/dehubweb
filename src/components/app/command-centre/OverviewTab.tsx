import { BalanceCard } from './BalanceCard';
import { IncomeChart } from './IncomeChart';
import { RecentTransactions } from './RecentTransactions';
import { SubscriptionsSummary } from './SubscriptionsSummary';
import { CloudUsageDashboard } from './CloudUsageDashboard';

export function OverviewTab() {
  return (
    <div className="space-y-4">

      {/* Cloud Usage Tracking */}
      <CloudUsageDashboard />

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
