import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
// Imported from the module, not the '@/lib/api/dehub' barrel: this hook is on
// the header's first paint, and the barrel drags every API client in with it.
import { getSubscriptionCredits } from '@/lib/api/dehub/subscriptions';

/** The signed-in user's subscription-token balance. */
export function useSubscriptionCredits() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['subscription-credits'],
    queryFn: getSubscriptionCredits,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });
}
