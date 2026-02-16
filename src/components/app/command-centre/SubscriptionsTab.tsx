import { useState } from 'react';
import { TrendingDown, TrendingUp, Info, Star, Loader2, ExternalLink, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMySubscriptions, useCreatorPlans } from '@/hooks/use-subscriptions';
import { getMediaUrl, type Subscription } from '@/lib/api/dehub';
import dehubCoin from '@/assets/dehub-coin.png';
import { format, isPast, differenceInDays } from 'date-fns';

function formatDuration(days: number): string {
  if (days === 7) return '1 week';
  if (days === 30) return '1 month';
  if (days === 90) return '3 months';
  if (days === 365) return '1 year';
  return `${days} days`;
}

function SubscriptionRow({ sub, index }: { sub: Subscription; index: number }) {
  const isExpired = isPast(new Date(sub.endDate));
  const daysLeft = differenceInDays(new Date(sub.endDate), new Date());
  const planName = sub.plan?.name || 'Plan';
  const planPrice = sub.plan?.price;
  const planDuration = sub.plan?.duration;
  const creatorShort = sub.creatorAddress
    ? `${sub.creatorAddress.slice(0, 6)}...${sub.creatorAddress.slice(-4)}`
    : 'Unknown';

  return (
    <tr className="text-zinc-400 hover:bg-white/[0.02] transition-colors">
      <td className="py-4 text-zinc-500">{String(index + 1).padStart(2, '0')}</td>
      <td className="py-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-zinc-700 text-white text-xs">
              {creatorShort.slice(2, 4).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-sm font-medium">{creatorShort}</span>
        </div>
      </td>
      <td className="py-4">
        <div>
          <p className="text-white text-sm">{planName}</p>
          {sub.plan?.description && (
            <p className="text-zinc-500 text-xs truncate max-w-[200px]">{sub.plan.description}</p>
          )}
        </div>
      </td>
      <td className="py-4">
        {planPrice !== undefined ? (
          <span className="flex items-center gap-1 text-white text-sm">
            {planPrice}
            <img src={dehubCoin} alt="DHB" className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="py-4 text-sm">
        <p>{format(new Date(sub.startDate), 'dd MMM yy')}</p>
        <p className="text-zinc-600">to</p>
        <p>{format(new Date(sub.endDate), 'dd MMM yy')}</p>
      </td>
      <td className="py-4">
        {isExpired ? (
          <span className="text-red-400 text-sm">Expired</span>
        ) : sub.isActive ? (
          <span className="text-emerald-400 text-sm">Active</span>
        ) : (
          <span className="text-zinc-500 text-sm">Inactive</span>
        )}
      </td>
      <td className="py-4 text-sm">
        {!isExpired && sub.isActive ? (
          <span className="text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {daysLeft}d left
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}

export function SubscriptionsTab() {
  const { isAuthenticated, walletAddress } = useAuth();
  const { subscriptions, isLoading: isLoadingSubs } = useMySubscriptions();
  const { plans: myPlans, isLoading: isLoadingPlans } = useCreatorPlans(walletAddress || undefined);

  const activeSubscriptions = subscriptions.filter(s => s.isActive && !isPast(new Date(s.endDate)));
  const expiredSubscriptions = subscriptions.filter(s => !s.isActive || isPast(new Date(s.endDate)));

  const totalMonthlySpend = activeSubscriptions.reduce((sum, sub) => {
    const price = sub.plan?.price || 0;
    const duration = sub.plan?.duration || 30;
    // Normalize to monthly cost
    return sum + (price / duration) * 30;
  }, 0);

  const isLoading = isLoadingSubs || isLoadingPlans;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
        <p className="text-zinc-500 text-sm">Loading subscriptions...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Star className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400 text-lg font-medium">Sign in to view subscriptions</p>
        <p className="text-zinc-500 text-sm mt-1">Connect your wallet to see your subscription activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="text-lg font-semibold text-white">Your subscriptions</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active count */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <span className="text-zinc-400 text-sm">Active Subscriptions</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{activeSubscriptions.length}</span>
            <span className="text-zinc-500 text-sm">creators</span>
          </div>
        </div>

        {/* Monthly spend */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <span className="text-zinc-400 text-sm">Est. Monthly Spend</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{Math.round(totalMonthlySpend)}</span>
            <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
          </div>
        </div>

        {/* My plans count */}
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <span className="text-zinc-400 text-sm">Your Plans (as creator)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{myPlans.length}</span>
            <span className="text-zinc-500 text-sm">plans</span>
          </div>
        </div>
      </div>

      {/* Subscription List */}
      {subscriptions.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-800 text-center">
          <Star className="w-12 h-12 text-zinc-600 mb-3 mx-auto" />
          <p className="text-zinc-400 text-lg font-medium">No subscriptions yet</p>
          <p className="text-zinc-500 text-sm mt-1">Subscribe to creators to see your activity here</p>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-semibold">Subscription list</span>
            <span className="text-zinc-500 text-sm">{subscriptions.length} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left font-normal pb-3">#</th>
                  <th className="text-left font-normal pb-3">Creator</th>
                  <th className="text-left font-normal pb-3">Plan</th>
                  <th className="text-left font-normal pb-3">Price</th>
                  <th className="text-left font-normal pb-3">Period</th>
                  <th className="text-left font-normal pb-3">Status</th>
                  <th className="text-left font-normal pb-3">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {subscriptions.map((sub, index) => (
                  <SubscriptionRow key={sub._id || sub.id || index} sub={sub} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
