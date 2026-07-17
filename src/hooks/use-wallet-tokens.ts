/**
 * Hook for fetching wallet token balances
 * Prefetches all chains for instant switching.
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAllTokenBalances, type WalletToken } from '@/lib/wallet/tokens';
import type { ChainId } from '@/components/app/ChainSelector';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, ETH_CHAIN_ID } from '@/lib/contracts/dhb-token';

const ALL_CHAINS: ChainId[] = [BASE_CHAIN_ID, BNB_CHAIN_ID, ETH_CHAIN_ID];

export function useWalletTokens(chainId: ChainId = BASE_CHAIN_ID) {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Prefetch other chains in background on mount
  useEffect(() => {
    if (!walletAddress || !isAuthenticated) return;
    ALL_CHAINS.forEach(cid => {
      if (cid === chainId) return;
      queryClient.prefetchQuery({
        queryKey: ['wallet-tokens', walletAddress.toLowerCase(), cid],
        queryFn: () => getAllTokenBalances(walletAddress, cid),
        staleTime: 5 * 60_000,
      });
    });
  }, [walletAddress, isAuthenticated]); // only on mount / auth change

  const { data: rawTokens = [], isLoading, isFetching, refetch } = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), chainId],
    queryFn: () => getAllTokenBalances(walletAddress!, chainId),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // placeholderData: keepPreviousData resolves from this hook's own live
  // QueryObserver, not from the QueryCache — AuthProvider's queryClient.clear()
  // on logout doesn't reset it for a still-mounted observer, so the previous
  // wallet's balances can keep showing until this query key actually changes.
  // Gate at the return boundary instead of fighting that cache-timing edge case.
  const tokens = walletAddress && isAuthenticated ? rawTokens : [];

  return { tokens, isLoading, isFetching, refetch };
}

/**
 * Hook to get tokens across ALL chains (for total balance computation)
 */
export function useAllChainsTokens() {
  const { walletAddress, isAuthenticated } = useAuth();

  const baseQuery = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), BASE_CHAIN_ID],
    queryFn: () => getAllTokenBalances(walletAddress!, BASE_CHAIN_ID),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const bnbQuery = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), BNB_CHAIN_ID],
    queryFn: () => getAllTokenBalances(walletAddress!, BNB_CHAIN_ID),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const ethQuery = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), ETH_CHAIN_ID],
    queryFn: () => getAllTokenBalances(walletAddress!, ETH_CHAIN_ID),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const allTokens = useMemo(() => [
    ...(baseQuery.data ?? []),
    ...(bnbQuery.data ?? []),
    ...(ethQuery.data ?? []),
  ], [baseQuery.data, bnbQuery.data, ethQuery.data]);

  const isLoading = baseQuery.isLoading || bnbQuery.isLoading || ethQuery.isLoading;

  return { allTokens, isLoading };
}
