import { useEffect, useState } from 'react';
import { Check, Clock, Loader2, Star, Users, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { type SubscriptionPlan, planPrice, primaryPlanChain, isPlanPublished } from '@/lib/api/dehub';
import { useBuyPlan, usePublishPlan } from '@/hooks/use-subscriptions';
import { formatDuration, getSubscriptionCost, normaliseDuration, fromWei, BASE_CHAIN_ID } from '@/lib/contracts';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';
import dehubCoin from '@/assets/dehub-coin.png';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isOwner?: boolean;
  isSubscribed?: boolean;
  onEdit?: () => void;
}

function formatDhb(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function PlanCard({ plan, isOwner, isSubscribed, onEdit }: PlanCardProps) {
  const { walletAddress } = useAuth();
  const buyPlanMutation = useBuyPlan();
  const publishMutation = usePublishPlan();

  const price = planPrice(plan);
  const chainEntry = primaryPlanChain(plan);
  const chainId = (chainEntry?.chainId || BASE_CHAIN_ID) as ChainId;
  const published = isPlanPublished(plan);
  // 999 is what lifetime plans were stored as before the contract's 0–12 range
  // was respected. Buying one reverts, so it is surfaced rather than hidden.
  const isBuyable = normaliseDuration(plan.duration) !== null;

  // The contract charges its fee on TOP of the list price, and the fee depends
  // on the buyer's badges — so the only honest total is one it quotes.
  const [total, setTotal] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    if (!quoteOpen || !walletAddress || !price || isOwner || !published) return;
    let cancelled = false;
    getSubscriptionCost({
      creator: plan.address || plan.creatorAddress || '',
      subscriber: walletAddress,
      planId: plan.id || plan._id || 0,
      duration: plan.duration,
      price,
      chainId,
    })
      .then((cost) => {
        if (!cancelled) setTotal(fromWei(cost.total, 18));
      })
      .catch(() => { /* fall back to showing the list price alone */ });
    return () => { cancelled = true; };
  }, [quoteOpen, walletAddress, price, isOwner, published, plan, chainId]);

  const handleSubscribe = async () => {
    await buyPlanMutation.mutateAsync({ plan, chainId });
  };

  const busy = buyPlanMutation.isPending;

  return (
    <div className="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 hover:border-white/20 transition-all">
      {/* Plan header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            {plan.name}
          </h3>
          {plan.description && (
            <p className="text-sm text-zinc-400 mt-1">{plan.description}</p>
          )}
        </div>
        {isSubscribed && (
          <span className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium">
            Subscribed
          </span>
        )}
      </div>

      {/* Price & Duration */}
      <div className="flex items-baseline gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
          <span className="text-2xl font-bold text-white">{formatDhb(price)}</span>
          <span className="text-zinc-400">DHB</span>
        </div>
        <span className="text-zinc-500">/</span>
        <div className="flex items-center gap-1 text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-sm">{formatDuration(plan.duration)}</span>
        </div>
      </div>

      {/* Benefits */}
      {plan.benefits && plan.benefits.length > 0 && (
        <ul className="space-y-2 mb-4">
          {plan.benefits.map((benefit, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
              <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Subscriber count */}
      {typeof plan.subscriberCount === 'number' && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4">
          <Users className="w-3.5 h-3.5" />
          <span>{plan.subscriberCount} subscriber{plan.subscriberCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Not yet on chain — nobody can buy this, so say so rather than showing
          a Subscribe button that reverts in the buyer's wallet. */}
      {!published && (
        <div className="flex items-start gap-2 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90">
            {isOwner
              ? 'Not published yet — publish it on chain to let people subscribe.'
              : 'This plan is not available to buy yet.'}
          </p>
        </div>
      )}

      {!isBuyable && (
        <div className="flex items-start gap-2 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200/90">
            This plan's duration is outside the range the contract accepts.
            {isOwner ? ' Recreate it to make it buyable.' : ''}
          </p>
        </div>
      )}

      {/* Actions */}
      {isOwner ? (
        <div className="flex gap-2">
          <Button
            onClick={onEdit}
            variant="outline"
            className="flex-1 rounded-xl border-white/20 text-white hover:bg-white/10"
          >
            Edit Plan
          </Button>
          {!published && isBuyable && (
            <Button
              onClick={() => publishMutation.mutate({ plan, chainId })}
              disabled={publishMutation.isPending}
              className="flex-1 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white gap-1.5"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {publishMutation.stageLabel}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Publish
                </>
              )}
            </Button>
          )}
        </div>
      ) : isSubscribed ? (
        <Button
          disabled
          className="w-full rounded-xl bg-white/10 text-zinc-400 cursor-not-allowed"
        >
          <Check className="w-4 h-4 mr-2" />
          Subscribed
        </Button>
      ) : (
        <AlertDialog onOpenChange={setQuoteOpen}>
          <AlertDialogTrigger asChild>
            <Button
              disabled={busy || !published || !isBuyable}
              className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {buyPlanMutation.stageLabel || 'Subscribing...'}
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 mr-2" />
                  Subscribe
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Confirm Subscription</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                Subscribe to <span className="text-white font-medium">{plan.name}</span> for{' '}
                <span className="text-yellow-400 font-medium">{formatDhb(price)} DHB</span> /{' '}
                {formatDuration(plan.duration)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Plan price</span>
                <span className="text-white">{formatDhb(price)} DHB</span>
              </div>
              <div className="flex justify-between text-zinc-400 mt-1.5 pt-1.5 border-t border-white/10">
                <span>You pay (incl. platform fee)</span>
                <span className="text-yellow-400 font-medium">
                  {total ? `${formatDhb(Number(total))} DHB` : 'calculating…'}
                </span>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSubscribe}
                disabled={busy}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Star className="w-4 h-4 mr-2" />
                )}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
