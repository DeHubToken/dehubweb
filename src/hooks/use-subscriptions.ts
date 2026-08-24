import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlans,
  getMySubscriptions,
  createPlan,
  updatePlan,
  buyPlan,
  confirmPlanPublished,
  confirmSubscriptionPurchase,
  isSubscribedToCreator,
  planPrice,
  primaryPlanChain,
  type SubscriptionPlan,
} from '@/lib/api/dehub';
import {
  buySubscriptionOnChain,
  publishPlanOnChain,
  normaliseDuration,
  parseTxError,
} from '@/lib/contracts';
import { BASE_CHAIN_ID } from '@/lib/contracts';
import type { ChainId } from '@/components/app/ChainSelector';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * A subscription is two things happening in order: a row in our database and a
 * transaction on chain. Neither half is a subscription on its own, and the old
 * hooks only ever did the first — `useBuyPlan` posted an intent, toasted
 * "Subscribed successfully!" and stopped, so nobody was ever charged and
 * nothing was ever activated.
 *
 * Both mutations below run the whole sequence and report which leg they are
 * on, because the middle one opens a wallet and can sit there for a while.
 */
export type ChainStage = 'idle' | 'preparing' | 'wallet' | 'confirming' | 'recording' | 'done';

export const STAGE_LABELS: Record<ChainStage, string> = {
  idle: '',
  preparing: 'Preparing…',
  wallet: 'Confirm in your wallet…',
  confirming: 'Waiting for the transaction…',
  recording: 'Finishing up…',
  done: 'Done',
};

/**
 * Hook for managing creator plans
 */
export function useCreatorPlans(creatorAddress?: string, enabled: boolean = true) {
  const { walletAddress } = useAuth();

  // Check if viewing own plans
  const isOwnPlans = creatorAddress?.toLowerCase() === walletAddress?.toLowerCase();

  // Always use the wallet address for fetching plans consistently
  const resolvedAddress = (isOwnPlans ? walletAddress : creatorAddress)?.toLowerCase();

  const plansQuery = useQuery({
    queryKey: ['plans', resolvedAddress || 'self'],
    // No address means "every plan on the platform" to this endpoint, not
    // "mine" — it carries no auth guard. Ask for nothing instead.
    queryFn: () => (resolvedAddress ? getPlans(resolvedAddress) : Promise.resolve([])),
    enabled: enabled && !!resolvedAddress,
    // Plans change only via this user's own mutations (which invalidate) —
    // 5s staleTime made every consumer remount refetch.
    staleTime: 5 * 60_000,
  });

  return {
    plans: plansQuery.data || [],
    isLoading: plansQuery.isLoading,
    isError: plansQuery.isError,
    error: plansQuery.error,
    refetch: plansQuery.refetch,
    hasPlans: (plansQuery.data?.length || 0) > 0,
    isOwnPlans,
  };
}

/**
 * Hook for managing user's subscriptions (what they're subscribed to)
 */
export function useMySubscriptions() {
  const { isAuthenticated } = useAuth();

  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscriptions,
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  return {
    subscriptions: subscriptionsQuery.data || [],
    isLoading: subscriptionsQuery.isLoading,
    isError: subscriptionsQuery.isError,
    error: subscriptionsQuery.error,
    refetch: subscriptionsQuery.refetch,
  };
}

/**
 * Hook to check if subscribed to a specific creator
 */
export function useIsSubscribed(creatorAddress?: string, enabled: boolean = true) {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['subscription-check', creatorAddress?.toLowerCase()],
    queryFn: () => isSubscribedToCreator(creatorAddress!),
    enabled: enabled && isAuthenticated && !!creatorAddress,
    staleTime: 30000,
  });

  return {
    isSubscribed: query.data ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Shared cache busting after anything that changes plans or subscriptions. */
function useSubscriptionInvalidation() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['plans'] });
    queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-check'] });
    queryClient.refetchQueries({ queryKey: ['plans', walletAddress?.toLowerCase() || 'self'] });
  }, [queryClient, walletAddress]);
}

/**
 * Publish an existing plan on chain.
 *
 * Split out from creation on purpose: the database row and the on-chain
 * listing are separate transactions, and the second one can fail on its own
 * (rejected in the wallet, out of gas, wrong network). When it does, the plan
 * survives as unpublished and this is how the creator finishes the job —
 * rather than being told to delete it and start again.
 */
export function usePublishPlan() {
  const invalidate = useSubscriptionInvalidation();
  const [stage, setStage] = useState<ChainStage>('idle');

  const mutation = useMutation({
    mutationFn: async ({ plan, chainId }: { plan: SubscriptionPlan; chainId?: ChainId }) => {
      const planId = plan.id || plan._id;
      if (!planId) throw new Error('Plan is missing an id');

      const chainEntry = primaryPlanChain(plan);
      const targetChain = (chainId || chainEntry?.chainId || BASE_CHAIN_ID) as ChainId;
      const price = planPrice(plan);
      if (!price) throw new Error('Plan is missing a price');

      setStage('wallet');
      const { confirmed } = await publishPlanOnChain({
        planId,
        duration: plan.duration,
        title: plan.name,
        description: plan.description,
        price,
        chainId: targetChain,
      });

      setStage('confirming');
      await confirmed;

      setStage('recording');
      await confirmPlanPublished(String(planId), targetChain);
      setStage('done');
      return plan;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Plan is live — people can subscribe now');
    },
    onError: (error: Error) => {
      setStage('idle');
      toast.error(parseTxError(error, 'publish plan'));
    },
    onSettled: () => setStage('idle'),
  });

  return { ...mutation, stage, stageLabel: STAGE_LABELS[stage] };
}

/**
 * Create a plan, then list it on chain so it can actually be bought.
 */
export function useCreatePlan() {
  const invalidate = useSubscriptionInvalidation();
  const [stage, setStage] = useState<ChainStage>('idle');

  const mutation = useMutation({
    mutationFn: async (planData: {
      name: string;
      description?: string;
      duration: number;
      tier: number;
      benefits?: string[];
      chains: { chainId: number; token: string; price: number }[];
    }) => {
      if (normaliseDuration(planData.duration) === null) {
        throw new Error('Plan duration must be between 0 and 12 months (0 = lifetime)');
      }

      setStage('preparing');
      const plan = await createPlan(planData);
      if (!plan?.id && !plan?._id) {
        throw new Error('The plan was not created — please try again');
      }
      const planId = plan.id || plan._id;
      const target = planData.chains[0];

      setStage('wallet');
      const { confirmed } = await publishPlanOnChain({
        planId: planId!,
        duration: planData.duration,
        title: planData.name,
        description: planData.description,
        price: target.price,
        chainId: target.chainId as ChainId,
      });

      setStage('confirming');
      await confirmed;

      setStage('recording');
      await confirmPlanPublished(String(planId), target.chainId);
      setStage('done');
      return plan;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Plan created and published');
    },
    onError: (error: Error) => {
      setStage('idle');
      console.error('[useCreatePlan]', error);
      // The row may well exist even when the chain step failed, so the copy
      // has to point at Publish rather than implying nothing happened.
      invalidate();
      toast.error(parseTxError(error, 'create plan'));
    },
    onSettled: () => setStage('idle'),
  });

  return { ...mutation, stage, stageLabel: STAGE_LABELS[stage] };
}

/**
 * Hook for updating an existing plan
 */
export function useUpdatePlan() {
  const invalidate = useSubscriptionInvalidation();

  return useMutation({
    mutationFn: ({
      planId,
      data,
    }: {
      planId: string;
      data: Partial<{
        name: string;
        description: string;
        price: number;
        duration: number;
        benefits: string[];
        chains: { chainId: number; token: string; price: number }[];
      }>;
    }) => updatePlan(planId, data),
    onSuccess: (_result, variables) => {
      invalidate();
      // Changing the price or duration revokes the on-chain listing, because
      // the contract charges what it holds rather than what we display.
      const republishes = variables.data.price !== undefined || variables.data.duration !== undefined;
      toast.success(
        republishes
          ? 'Plan updated — publish it again to make the new price live'
          : 'Plan updated',
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update plan');
    },
  });
}

/**
 * Subscribe: reserve the row, pay on chain, then have the server verify it.
 */
export function useBuyPlan() {
  const invalidate = useSubscriptionInvalidation();
  const [stage, setStage] = useState<ChainStage>('idle');

  const mutation = useMutation({
    mutationFn: async ({ plan, chainId }: { plan: SubscriptionPlan; chainId?: ChainId }) => {
      const planId = plan.id || plan._id;
      if (!planId) throw new Error('Plan is missing an id');

      setStage('preparing');
      const intent = await buyPlan(String(planId), chainId);
      if (!intent?.id) {
        throw new Error('Could not start the subscription — please try again');
      }

      const targetChain = (intent.chainId || chainId || BASE_CHAIN_ID) as ChainId;

      setStage('wallet');
      const { confirmed, hash } = await buySubscriptionOnChain({
        creator: intent.creatorAddress,
        planId,
        duration: intent.duration ?? plan.duration,
        price: intent.price,
        chainId: targetChain,
      });

      setStage('confirming');
      await confirmed;

      // The server verifies against chain state, so a failure here costs the
      // buyer nothing permanent — the next read of their subscriptions
      // reconciles it. Which is why this does not throw.
      setStage('recording');
      try {
        await confirmSubscriptionPurchase(String(intent.id), hash, targetChain);
      } catch (err) {
        console.warn('[useBuyPlan] confirmation call failed, will reconcile on next read:', err);
      }
      setStage('done');
      return intent;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Subscribed');
    },
    onError: (error: Error) => {
      setStage('idle');
      toast.error(parseTxError(error, 'subscribe'));
    },
    onSettled: () => setStage('idle'),
  });

  return { ...mutation, stage, stageLabel: STAGE_LABELS[stage] };
}
