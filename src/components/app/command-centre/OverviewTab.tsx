import { TrendingUp, Info, Settings2, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BalanceCard } from './BalanceCard';
import { IncomeChart } from './IncomeChart';
import { RecentTransactions } from './RecentTransactions';
import { SubscriptionsSummary } from './SubscriptionsSummary';

export function OverviewTab() {
  return (
    <div className="space-y-4">
      {/* Top Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Overview</h2>
        <div className="flex gap-2">
          <Button variant="glass" className="text-sm h-9 px-4 rounded-xl">
            Add funds
          </Button>
          <Button variant="glass" className="text-sm h-9 px-4 rounded-xl">
            Withdraw
          </Button>
        </div>
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
