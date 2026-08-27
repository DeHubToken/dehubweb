/**
 * Subscriber Gate Drawer
 * ======================
 * What a subscriber-gated post opens when someone who is not a subscriber taps
 * through. It shows the plans that unlock THAT post with the real buy flow —
 * the same PlanCard the profile's Subs tab uses, so there is exactly one
 * purchase path in the app rather than a second half-built one here.
 *
 * Only ever reached through a lazy import (see PostCard): PlanCard pulls in the
 * subscription contracts, and the feed cards are on the boot path
 * (scripts/check-entry-bundle.mjs fails the build if that stack lands eagerly).
 *
 * The plans are re-fetched rather than rendered from the feed's `plansDetails`.
 * That payload carries no duration-safe price, and buying needs the duration,
 * the chain and the published state — and a plan the creator edited since the
 * feed was cached would otherwise be bought at a stale price.
 *
 * But the fetch asks for the creator's whole catalogue, and the gate is only
 * the plan ids stored on the post. Rendering all of them offered a reader plans
 * that do not open the post they are standing in front of — pay, and stay
 * locked out. So the fetched rows are narrowed to the ids the post carries, and
 * to the ones that can actually be bought.
 */
import { useEffect, useMemo } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useCreatorPlans, useIsSubscribed } from '@/hooks/use-subscriptions';
import { PlanCard } from '@/components/app/subscriptions/PlanCard';
import { DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { isPlanPublished, type SubscriptionPlan } from '@/lib/api/dehub';
import type { SubscriberPlan } from '@/lib/content-gate';

interface SubscriberGateDrawerProps {
  creatorAddress: string;
  creatorName: string;
  /**
   * The post's own plans, from the feed — both so the sheet can name a price
   * before the fetch lands and so it knows which of the creator's plans are
   * the ones that open this post.
   */
  previewPlans?: SubscriberPlan[];
  onSubscribed: () => void;
}

/** Plan ids come back as numbers, strings and Mongo _ids. Compare as strings. */
function planKeys(plan: SubscriptionPlan | SubscriberPlan): string[] {
  return [(plan as any).id, (plan as any)._id]
    .filter((v) => v !== undefined && v !== null)
    .map(String);
}

export function SubscriberGateDrawer({
  creatorAddress,
  creatorName,
  previewPlans,
  onSubscribed,
}: SubscriberGateDrawerProps) {
  const { plans, isLoading } = useCreatorPlans(creatorAddress);
  // PlanCard's buy flow invalidates this key when a purchase lands, so the
  // gate opens on its own without the sheet having to know it happened.
  const { isSubscribed } = useIsSubscribed(creatorAddress);

  const gatingPlans = useMemo(() => {
    const all = (plans || []) as SubscriptionPlan[];
    // No preview means an older caller that never sent the post's plans. Show
    // the catalogue rather than an empty sheet, which is the worse failure.
    const wanted = new Set((previewPlans || []).flatMap(planKeys));
    const scoped = wanted.size
      ? all.filter((p) => planKeys(p).some((k) => wanted.has(k)))
      : all;
    // An unpublished plan's Subscribe button is disabled, so listing it here is
    // an invitation to a dead end. isSubscriberGated already refuses to gate a
    // post on plans like these, so in practice this sheet never opens for one.
    const buyable = scoped.filter(isPlanPublished);
    return buyable.length ? buyable : scoped;
  }, [plans, previewPlans]);

  useEffect(() => {
    if (isSubscribed) onSubscribed();
  }, [isSubscribed, onSubscribed]);

  return (
    <>
      <DrawerHeader className="pb-3">
        <DrawerTitle className="text-white text-lg flex items-center gap-2">
          <Star className="w-5 h-5 text-white" />
          Subscribers only
        </DrawerTitle>
        <p className="text-white/60 text-sm text-left">
          {creatorName} keeps this post for their subscribers.
        </p>
      </DrawerHeader>

      {isLoading && !previewPlans?.length ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-white/60" />
        </div>
      ) : gatingPlans.length ? (
        <div className="flex flex-col gap-3 pb-2">
          {gatingPlans.map((plan: any) => (
            <PlanCard key={plan.id ?? plan._id} plan={plan} />
          ))}
        </div>
      ) : (
        // The gate is stamped by the server from the plan ids on the post, so
        // an empty list here means the creator deleted the plan after posting.
        // Saying so beats an empty sheet, which is what the old gate did.
        <p className="text-center text-white/60 text-sm py-8">
          {creatorName} has no subscription open right now.
        </p>
      )}
    </>
  );
}
