/**
 * Hook for fetching wallet token balances
 * Prefetches all chains for instant switching.
 */

import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAllTokenBalances, type WalletToken } from '@/lib/wallet/tokens';
import { getSolanaTokenBalances } from '@/lib/wallet/solana-tokens';
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

  // Consumers live in persistent pages that never unmount — only poll the
  // per-token balanceOf RPC batch while a wallet surface is actually shown.
  const { pathname } = useLocation();
  const isWalletSurfaceActive =
    pathname === '/app/wallet' || pathname === '/app/buy' ||
    pathname === '/app/stake' || pathname === '/stake';

  const { data: rawTokens = [], isLoading, isFetching, refetch } = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', walletAddress?.toLowerCase(), chainId],
    queryFn: () => getAllTokenBalances(walletAddress!, chainId),
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchInterval: isWalletSurfaceActive ? 5 * 60_000 : false,
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
  const { walletAddress, isAuthenticated, user } = useAuth();

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

  /**
   * Solana holdings, read from the account's LINKED Solana address rather than
   * from a connected wallet — someone signed in with Google has no Phantom
   * attached to the page and should still see what they hold.
   *
   * Its own query rather than a branch inside `getAllTokenBalances`, because
   * nothing about the EVM path applies: no wagmi, no ERC20 calls, no
   * CHAIN_CONFIGS entry. It also fails independently — a Solana RPC that is
   * rate-limiting must not stop Base and BNB balances rendering.
   */
  const solanaAddress = user?.solanaAddress ?? null;
  const solanaQuery = useQuery<WalletToken[]>({
    queryKey: ['wallet-tokens', 'solana', solanaAddress],
    queryFn: () => getSolanaTokenBalances(solanaAddress),
    enabled: !!solanaAddress && isAuthenticated,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const allTokens = useMemo(() => [
    ...(baseQuery.data ?? []),
    ...(bnbQuery.data ?? []),
    ...(ethQuery.data ?? []),
    ...(solanaQuery.data ?? []),
  ], [baseQuery.data, bnbQuery.data, ethQuery.data, solanaQuery.data]);

  // Solana is excluded on purpose: it is optional (most accounts have no
  // linked address) and slower, and gating the whole wallet's skeleton on it
  // would delay balances that are already in hand.
  const isLoading = baseQuery.isLoading || bnbQuery.isLoading || ethQuery.isLoading;

  return { allTokens, isLoading };
}
