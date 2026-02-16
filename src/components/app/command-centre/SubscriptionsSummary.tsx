import { TrendingUp, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dehubCoin from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import { useMySubscriptions, useCreatorPlans } from '@/hooks/use-subscriptions';
import { isPast } from 'date-fns';

export function SubscriptionsSummary() {
  const { isAuthenticated, walletAddress } = useAuth();
  const { subscriptions, isLoading: subsLoading } = useMySubscriptions();
  const { plans, isLoading: plansLoading } = useCreatorPlans(walletAddress || undefined);

  const isLoading = subsLoading || plansLoading;

  const activeSubscriptions = subscriptions.filter(
    (s) => s.isActive && !isPast(new Date(s.endDate))
  );

  const totalMonthlySpend = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.plan?.price || 0;
    const duration = sub.plan?.duration || 30;
    return sum + (price / duration) * 30;
  }, 0);

  if (!isAuthenticated) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">Sign in to view subscriptions</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Subscriptions</h3>
        <Button variant="glass" size="sm" className="text-xs h-8 rounded-xl">
          View Details
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <span className="text-zinc-500 text-xs">Active</span>
              <p className="text-white text-xl font-bold">{activeSubscriptions.length}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <span className="text-zinc-500 text-xs">Total</span>
              <p className="text-white text-xl font-bold">{subscriptions.length}</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-3">
              <span className="text-zinc-500 text-xs">Your Plans</span>
              <p className="text-white text-xl font-bold">{plans.length}</p>
            </div>
          </div>

          {/* Monthly Spend */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-400 text-sm">Est. monthly spend</span>
              {activeSubscriptions.length > 0 && (
                <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {activeSubscriptions.length} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {Math.round(totalMonthlySpend).toLocaleString()}
              </span>
              <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
            </div>
          </div>

          {activeSubscriptions.length === 0 && subscriptions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-4 mt-2">
              <Star className="w-8 h-8 text-zinc-600 mb-2" />
              <p className="text-zinc-500 text-sm">No subscriptions yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
