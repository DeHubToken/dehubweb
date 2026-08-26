/**
 * A creator's subscription plans, without the wallet stack.
 * =========================================================
 * `use-subscriptions` owns the buy and publish flows, so it statically imports
 * `@/lib/contracts` — a barrel. Anything on the boot path that reaches it drags
 * the subscription contracts and their transitive closure into the entry bundle
 * (scripts/boot-path-report.mjs caught exactly that). The composer only needs to
 * know which plans exist, so it reads them through here instead.
 *
 * The sheet that actually sells a plan still uses `use-subscriptions` — it is
 * lazy-loaded, so the contracts arrive with it rather than at boot.
 */
import { useQuery } from '@tanstack/react-query';
import { getPlans, type SubscriptionPlan } from '@/lib/api/dehub/subscriptions';

export function useCreatorPlansLite(creatorAddress?: string | null) {
  const address = creatorAddress?.toLowerCase();

  const query = useQuery({
    // Same key as use-subscriptions' useCreatorPlans, so a plan created there
    // and a plan read here can never disagree.
    queryKey: ['plans', address || 'self'],
    queryFn: () => (address ? getPlans(address) : Promise.resolve([])),
    enabled: !!address,
    staleTime: 5 * 60_000,
  });

  const plans: SubscriptionPlan[] = query.data || [];

  return {
    plans,
    planIds: plans.map((p) => String((p as any).id ?? (p as any)._id)).filter(Boolean),
    hasPlans: plans.length > 0,
    isLoading: query.isLoading,
  };
}
