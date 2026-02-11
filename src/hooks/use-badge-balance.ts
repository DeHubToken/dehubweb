/**
 * Badge Balance Hook
 * ==================
 * Queries on-chain DHB holdings + staking balance via edge function.
 * Results are cached and deduplicated by React Query.
 */

import { useQuery } from '@tanstack/react-query';

async function fetchBadgeBalance(address: string): Promise<number> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-badge-balance?address=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Badge balance fetch failed: ${response.status}`);
  }

  const json = await response.json();
  return json.badgeBalance ?? 0;
}

/**
 * Hook to get a user's badge balance (DHB holdings + staked across Base & BNB)
 */
export function useBadgeBalance(walletAddress?: string | null) {
  const query = useQuery({
    queryKey: ['badge-balance', walletAddress?.toLowerCase()],
    queryFn: () => fetchBadgeBalance(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    badgeBalance: query.data,
    isLoading: query.isLoading,
  };
}

/**
 * Batch fetch badge balances for multiple addresses
 */
async function fetchBatchBadgeBalances(addresses: string[]): Promise<Record<string, number>> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-badge-balance?addresses=${encodeURIComponent(addresses.join(','))}`;
  const response = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Batch badge balance fetch failed: ${response.status}`);
  }

  const json = await response.json();
  return json.results ?? {};
}

/**
 * Hook to batch-fetch badge balances for multiple addresses
 */
export function useBatchBadgeBalances(addresses: string[]) {
  const sorted = [...new Set(addresses.map(a => a.toLowerCase()).filter(Boolean))].sort();
  
  const query = useQuery({
    queryKey: ['badge-balance-batch', sorted],
    queryFn: () => fetchBatchBadgeBalances(sorted),
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    balances: query.data ?? {},
    isLoading: query.isLoading,
  };
}
