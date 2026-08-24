import { useState } from 'react';
import { TrendingDown, TrendingUp, Info, Star, Loader2, ExternalLink, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useMySubscriptions, useCreatorPlans } from '@/hooks/use-subscriptions';
import {
  planPrice,
  isLiveSubscription,
  monthlySpend,
  type Subscription,
  type SubscriptionPlan,
} from '@/lib/api/dehub';
import dehubCoin from '@/assets/dehub-coin.png';
import { format, isPast, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

const cardClass = "rounded-2xl p-5 bg-zinc-900 border border-zinc-800";

/**
 * Every date in this table came out of the API as `undefined` before the
 * response shapes were fixed, and `format(new Date(undefined))` throws
 * `RangeError: Invalid time value` — which took the whole Command Centre tab
 * down with it rather than showing a dash. The guards stay: an unconfirmed
 * purchase legitimately has no start date yet.
 */
function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeFormat(value: string | undefined, pattern: string): string {
  const date = toDate(value);
  return date ? format(date, pattern) : '—';
}

function SubscriptionRow({ sub, index }: { sub: Subscription; index: number }) {
  const endDate = toDate(sub.endDate);
  const isExpired = endDate ? isPast(endDate) : false;
  const daysLeft = endDate ? differenceInDays(endDate, new Date()) : 0;
  const planName = sub.plan?.name || 'Plan';
  const price = planPrice(sub.plan || ({} as SubscriptionPlan));
  const creatorAddress = sub.creatorAddress || sub.plan?.address;
  const creatorShort = creatorAddress
    ? `${creatorAddress.slice(0, 6)}...${creatorAddress.slice(-4)}`
    : 'Unknown';

  return (
    <tr className="text-zinc-400 transition-colors hover:bg-white/[0.02]">
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
        {price !== undefined ? (
          <span className="flex items-center gap-1 text-white text-sm">
            {price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            <img src={dehubCoin} alt="DHB" className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="py-4 text-sm">
        <p>{safeFormat(sub.startDate, 'dd MMM yy')}</p>
        <p className="text-zinc-600">to</p>
        <p>{sub.isLifetime ? 'never' : safeFormat(sub.endDate, 'dd MMM yy')}</p>
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
            {sub.isLifetime ? 'lifetime' : `${daysLeft}d left`}
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

  const tableHeaderBorder = "border-b border-zinc-800";
  const tableDivider = "divide-y divide-zinc-800";

  const activeSubscriptions = subscriptions.filter(isLiveSubscription);
  const totalMonthlySpend = monthlySpend(activeSubscriptions);

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
        <div data-page-bento className={cardClass}>
          <span className="text-zinc-400 text-sm">Active Subscriptions</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{activeSubscriptions.length}</span>
            <span className="text-zinc-500 text-sm">creators</span>
          </div>
        </div>

        {/* Monthly spend */}
        <div data-page-bento className={cardClass}>
          <span className="text-zinc-400 text-sm">Est. Monthly Spend</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{Math.round(totalMonthlySpend)}</span>
            <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
          </div>
        </div>

        {/* My plans count */}
        <div data-page-bento className={cardClass}>
          <span className="text-zinc-400 text-sm">Your Plans (as creator)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold text-white">{myPlans.length}</span>
            <span className="text-zinc-500 text-sm">plans</span>
          </div>
        </div>
      </div>

      {/* Subscription List */}
      {subscriptions.length === 0 ? (
        <div data-page-bento className={cn(cardClass, "p-8 text-center")}>
          <Star className="w-12 h-12 text-zinc-600 mb-3 mx-auto" />
          <p className="text-zinc-400 text-lg font-medium">No subscriptions yet</p>
          <p className="text-zinc-500 text-sm mt-1">Subscribe to creators to see your activity here</p>
        </div>
      ) : (
        <div data-page-bento className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-semibold">Subscription list</span>
            <span className="text-zinc-500 text-sm">{subscriptions.length} total</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn("text-zinc-500 text-xs", tableHeaderBorder)}>
                  <th className="text-left font-normal pb-3">#</th>
                  <th className="text-left font-normal pb-3">Creator</th>
                  <th className="text-left font-normal pb-3">Plan</th>
                  <th className="text-left font-normal pb-3">Price</th>
                  <th className="text-left font-normal pb-3">Period</th>
                  <th className="text-left font-normal pb-3">Status</th>
                  <th className="text-left font-normal pb-3">Remaining</th>
                </tr>
              </thead>
              <tbody className={tableDivider}>
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
