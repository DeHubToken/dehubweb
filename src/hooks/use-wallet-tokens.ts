/**
 * Hook for fetching wallet token balances
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAllTokenBalances, type WalletToken } from '@/lib/wallet/tokens';
import type { ChainId } from '@/components/app/ChainSelector';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

export function useWalletTokens(chainId: ChainId = BASE_CHAIN_ID) {
  const { walletAddress, isAuthenticated } = useAuth();

  const { data: tokens = [], isLoading, refetch } = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), chainId],
    queryFn: () => getAllTokenBalances(walletAddress!, chainId),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { tokens, isLoading, refetch };
}
