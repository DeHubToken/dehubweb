import { BalanceCard } from './BalanceCard';
import { IncomeChart } from './IncomeChart';
import { EngagementChart } from './EngagementChart';
import { RecentTransactions } from './RecentTransactions';
import { SubscriptionsSummary } from './SubscriptionsSummary';
import { StatsBar } from './StatsBar';

export function OverviewTab() {
  return (
    <div className="space-y-4">

      {/* Main Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BalanceCard />
        <IncomeChart />
      </div>

      {/* Engagement Analytics (#14) */}
      <EngagementChart />

      {/* Bottom Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentTransactions />
        <SubscriptionsSummary />
      </div>

      {/* Stats Bar */}
      <StatsBar />
    </div>
  );
}
