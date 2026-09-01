import { useEffect, useState } from 'react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { Check, Clock, Loader2, Star, Users, Upload, Info } from 'lucide-react';
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

/**
 * One subscription plan, wherever plans are shown — the profile's Subs tab and
 * the sheet a subscriber-gated post opens.
 *
 * Monochrome on purpose. This card used to carry a yellow-to-orange gradient
 * Subscribe button, a yellow star, a green "Subscribed" pill and amber and red
 * notices: four accent hues on a surface the rest of the app renders in black,
 * white and zinc (the design system block at the top of index.css). Every state
 * below is told apart by its copy and its icon instead.
 */

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

/** Shared shape for the two "you cannot buy this" notices. */
function PlanNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-4 rounded-xl bg-white/[0.06] border border-white/10 p-3">
      <Info className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
      <p className="text-xs text-white/70">{children}</p>
    </div>
  );
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
  const subscriberCount = plan.subscriberCount;

  return (
    <div className="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 hover:border-white/20 transition-all">
      {/* Plan header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-white" />
            {plan.name}
          </h3>
          {plan.description && (
            <p className="text-sm text-zinc-400 mt-1">{plan.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* A creator's own drafts read as unfinished at a glance, so scanning
              the tab shows which plans still need a step to become real. */}
          {isOwner && !published && (
            <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-white/60 text-xs font-medium">
              Draft
            </span>
          )}
          {isSubscribed && (
            <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-medium">
              Subscribed
            </span>
          )}
        </div>
      </div>

      {/* Price & Duration */}
      <div className="flex items-baseline gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
          <span className="text-2xl font-bold text-white">{formatDhb(price)}</span>
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
              <Check className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Subscriber count */}
      {typeof subscriberCount === 'number' && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4">
          <Users className="w-3.5 h-3.5" />
          <span>
            {subscriberCount} subscriber{subscriberCount === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Not yet on chain — nobody can buy this, so say so rather than showing
          a Subscribe button that reverts in the buyer's wallet. */}
      {!published && isBuyable && (
        <PlanNotice>
          {isOwner
            ? 'This plan is a draft. Publish it on chain and people can subscribe — it is one transaction from your wallet.'
            : 'This plan is not available to buy yet.'}
        </PlanNotice>
      )}

      {!isBuyable && (
        <PlanNotice>
          {isOwner
            ? 'This plan was set up before the current duration rules, so the chain will never accept it. Start again to pick a new duration — the name, price and benefits are kept.'
            : 'This plan is not available to buy.'}
        </PlanNotice>
      )}

      {/* Actions */}
      {isOwner ? (
        <div className="flex gap-2">
          {/* A plan the chain will never accept has one useful action, and it is
              not "Edit" — the duration is the thing that has to change, so the
              button says what the creator actually has to do. */}
          <Button
            onClick={onEdit}
            variant={isBuyable ? 'outline' : 'default'}
            className={
              isBuyable
                ? 'flex-1 rounded-xl border-white/20 text-white hover:bg-white/10'
                : 'flex-1 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white font-semibold'
            }
          >
            {isBuyable ? 'Edit Plan' : 'Start again'}
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
              className="w-full rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white font-semibold disabled:opacity-40"
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
                <span className="text-white font-medium">{formatDhb(price)} <DhbCoin /></span> /{' '}
                {formatDuration(plan.duration)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Plan price</span>
                <span className="text-white">{formatDhb(price)} <DhbCoin /></span>
              </div>
              <div className="flex justify-between text-zinc-400 mt-1.5 pt-1.5 border-t border-white/10">
                <span>You pay (incl. platform fee)</span>
                <span className="text-white font-medium">
                  {total ? formatDhb(Number(total)) + ' DHB' : 'calculating…'}
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
                className="bg-white/10 border border-white/20 hover:bg-white/20 text-white font-semibold"
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
