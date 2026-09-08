import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDaoTreasury, DAO_TREASURY_ADDRESS } from '@/lib/dao-treasury';
import { payDhb, readDhbBalance } from '@/lib/dhb-payment';

export const DAO_TREASURY_QUERY_KEY = ['dao-treasury'] as const;

export function useDaoTreasury() {
  return useQuery({
    queryKey: DAO_TREASURY_QUERY_KEY,
    queryFn: fetchDaoTreasury,
    // Direct wallet/exchange transfers never pass through this client, so a
    // live page has to revisit the chain. Manual Refresh remains beside the
    // total for people who do not want to wait for the next poll.
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useOwnDhbBalance(enabled: boolean) {
  return useQuery({
    queryKey: ['dao-own-dhb-balance'],
    queryFn: readDhbBalance,
    enabled,
    staleTime: 30_000,
  });
}

export function useContributeToDao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) =>
      payDhb(amount, DAO_TREASURY_ADDRESS, { context: 'DAO contribution' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dao-own-dhb-balance'] });
      // The RPC's log index trails the head by a block or two; refetch once
      // now for the balance and again shortly after for the contributor row.
      queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY }), 8_000);
    },
  });
}
