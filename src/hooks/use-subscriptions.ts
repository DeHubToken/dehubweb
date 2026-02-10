import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPlans, 
  getMyPlans, 
  getMySubscriptions, 
  createPlan, 
  updatePlan, 
  buyPlan,
  isSubscribedToCreator,
  type SubscriptionPlan,
  type Subscription 
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Hook for managing creator plans
 */
export function useCreatorPlans(creatorAddress?: string) {
  const { isAuthenticated, walletAddress } = useAuth();
  
  // Check if viewing own plans
  const isOwnPlans = creatorAddress?.toLowerCase() === walletAddress?.toLowerCase();

  // Always use the wallet address for fetching plans consistently
  const resolvedAddress = isOwnPlans ? walletAddress : creatorAddress;

  const plansQuery = useQuery({
    queryKey: ['plans', resolvedAddress?.toLowerCase() || 'self'],
    queryFn: () => resolvedAddress ? getPlans(resolvedAddress) : Promise.resolve([]),
    enabled: !!resolvedAddress,
    staleTime: 5000,
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
export function useIsSubscribed(creatorAddress?: string) {
  const { isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['subscription-check', creatorAddress],
    queryFn: () => isSubscribedToCreator(creatorAddress!),
    enabled: isAuthenticated && !!creatorAddress,
    staleTime: 30000,
  });

  return {
    isSubscribed: query.data ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * Hook for creating a new subscription plan
 */
export function useCreatePlan() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: (planData: {
      name: string;
      description?: string;
      duration: number;
      tier: number;
      benefits?: string[];
      chains: { chainId: number; token: string; price: number }[];
    }) => createPlan(planData),
    onSuccess: () => {
      // Invalidate all plan queries to ensure immediate refresh
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.refetchQueries({ queryKey: ['plans', walletAddress?.toLowerCase() || 'self'] });
      toast.success('Plan created successfully!');
    },
    onError: (error: Error) => {
      console.error('[useCreatePlan] Full error:', error);
      toast.error(error.message || 'Failed to create plan');
    },
  });
}

/**
 * Hook for updating an existing plan
 */
export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, data }: { 
      planId: string; 
      data: Partial<{
        name: string;
        description: string;
        price: number;
        currency: string;
        duration: number;
        benefits: string[];
        isActive: boolean;
      }>;
    }) => updatePlan(planId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan updated successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update plan');
    },
  });
}

/**
 * Hook for subscribing to a plan
 */
export function useBuyPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => buyPlan(planId),
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-check'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Subscribed successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to subscribe');
    },
  });
}
