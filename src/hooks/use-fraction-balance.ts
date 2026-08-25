/**
 * Fraction Balance
 * ================
 * How many fractions of one post one wallet holds, read straight off the
 * collection contract.
 *
 * Every selling surface needs this and none of them can use the holder list:
 * `getTokenHolders` scans 500k blocks of transfer events to answer "who holds
 * this", takes up to 15 seconds, and caches for five minutes — so capping a
 * sell drawer on it means capping on a number that may be five minutes stale,
 * in the one place where being stale means listing fractions you no longer own.
 * This is a single eth_call, cached for a minute.
 */

import { useQuery } from '@tanstack/react-query';
import { getFractionBalance } from '@/lib/api/token-holders';
import { useAuth } from '@/contexts/AuthContext';

export function useFractionBalance(
  tokenId: string | number | undefined,
  chainId: number = 8453,
  address?: string | null,
) {
  const { walletAddress } = useAuth();
  const owner = (address ?? walletAddress)?.toLowerCase() || null;

  return useQuery({
    queryKey: ['fraction-balance', owner, String(tokenId ?? ''), chainId],
    queryFn: () => getFractionBalance(owner, tokenId, chainId),
    enabled: !!owner && tokenId !== undefined && tokenId !== null && tokenId !== '',
    staleTime: 60_000,
    // A failed read is "unknown", not zero. Retrying once covers a flaky RPC
    // without making the drawer sit on a spinner.
    retry: 1,
  });
}
