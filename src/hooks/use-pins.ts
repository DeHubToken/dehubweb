import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { togglePin, getUserPins, getPinCount, getPinners } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DeHubPin } from '@/lib/api/dehub';

const PINS_KEY = 'pins';

export function useUserPins(address: string) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: [PINS_KEY, address],
    queryFn: async () => {
      const res = await getUserPins(address);
      return { items: res.result || [], pagination: res.pagination };
    },
    enabled: !!address,
    staleTime: 2 * 60 * 1000,
  });
}

export function useTogglePin() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: togglePin,
    onSuccess: (data, tokenId) => {
      // Patch this post's pin count in place instead of refetching every pin query
      queryClient.setQueryData<number>([PINS_KEY, 'count', tokenId], (old) =>
        old === undefined ? undefined : Math.max(0, old + (data.pinned ? 1 : -1)));
      // Only this post's pinners list + the current user's own pins list are affected
      queryClient.invalidateQueries({ queryKey: [PINS_KEY, 'users', tokenId] });
      if (walletAddress) {
        const me = walletAddress.toLowerCase();
        queryClient.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === PINS_KEY &&
            typeof q.queryKey[1] === 'string' &&
            q.queryKey[1].toLowerCase() === me,
        });
      }
      if (data.pinned) {
        toast.success('Post pinned');
      } else {
        toast.success('Post unpinned');
      }
    },
    onError: () => toast.error('Failed to update pin'),
  });
}

export function usePinCount(tokenId: number) {
  return useQuery({
    queryKey: [PINS_KEY, 'count', tokenId],
    queryFn: async () => {
      const res = await getPinCount(tokenId);
      return res.count || 0;
    },
    enabled: !!tokenId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePinners(tokenId: number) {
  return useQuery({
    queryKey: [PINS_KEY, 'users', tokenId],
    queryFn: async () => {
      const res = await getPinners(tokenId);
      return { items: res.result || [], pagination: res.pagination };
    },
    enabled: !!tokenId,
    staleTime: 2 * 60 * 1000,
  });
}
