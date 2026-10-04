import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDaoTreasury, DAO_TREASURY_ADDRESS } from '@/lib/dao-treasury';
import { payDhb, readDhbBalance } from '@/lib/dhb-payment';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall } from '@/lib/api/dehub/core';
import { invalidateSelfBadgeBalance } from '@/hooks/use-self-badge-balance';

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
  const { walletAddress, refreshUser } = useAuth();
  return useMutation({
    mutationFn: (amount: number) =>
      // A contribution settles the moment the transfer lands -- there is no
      // second step here that needs the receipt, so holding the drawer open
      // on it only gives people a reason to send again.
      payDhb(amount, DAO_TREASURY_ADDRESS, {
        context: 'DAO contribution',
        confirmInBackground: true,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dao-own-dhb-balance'] });
      // The RPC's log index trails the head by a block or two; refetch once
      // now for the balance and again shortly after for the contributor row.
      queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: DAO_TREASURY_QUERY_KEY }), 8_000);
      // Receipt confirmation keeps the drawer responsive while making the
      // retained contribution visible on the holder's badge immediately.
      void result.confirmed.then(async confirmed => {
        if (!confirmed || !walletAddress) return;
        await apiCall(`/api/badge/refresh/${walletAddress}`, { method: 'POST', body: {} });
        await refreshUser();
        invalidateSelfBadgeBalance(queryClient);
        queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
      }).catch(() => {});
    },
  });
}
