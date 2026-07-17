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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: togglePin,
    onSuccess: (data, tokenId) => {
      queryClient.invalidateQueries({ queryKey: [PINS_KEY] });
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
