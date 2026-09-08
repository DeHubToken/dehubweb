/**
 * The signed-in wallet's whole DHB position, in one place.
 * ========================================================
 * Three surfaces answered "how much DHB do I have" and all three answered
 * differently: the wallet page re-derived staking in the browser, Settings
 * hardcoded a zero, and the badge ladder read the API. This is the single
 * definition, and it deliberately matches the badge ladder — that is the
 * number a user's tier is actually decided on, so it is the one they will
 * see quoted back at them everywhere else in the app.
 *
 * The two halves come from different places on purpose:
 *
 * - **Wallet DHB is read live from the chain.** It moves the moment a
 *   transfer lands, while the API's copy only moves when the backend's chain
 *   webhook gets to it.
 * - **Staked DHB comes from the API.** Only the backend can see it. It is the
 *   legacy BNB contract position plus the transfer-pool ledger, and neither is
 *   something a `balanceOf` can return.
 *
 * Why this does not re-derive staking from the chain — the wallet page used
 * to, and it under-reported. It scanned the DHB Transfer log for user↔pool
 * transfers, then subtracted any unstake *request* sitting in Supabase. Those
 * requests are queue entries settled by hand from a treasury address, so the
 * pool's own outbound log never shows one: the subtraction fired against DHB
 * that had never moved and was still the user's. At least one account had a
 * real, unpaid 1,000,000 DHB deducted here while their profile, their badge
 * and the leaderboard all went on counting it.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { getAccountInfo } from '@/lib/api/dehub';
import { getGiveawayPrizeFor } from '@/lib/worldCupGiveaway';

export const DHB_STAKED_QUERY_KEY = 'dhb-staked';

export interface DhbHoldings {
  /** DHB sitting in the wallet, summed across every chain. Read from chain. */
  wallet: number;
  /** DHB staked — the legacy BNB contract plus the transfer pool. From the API. */
  staked: number;
  /** Custodial giveaway credit, counted but not yet transferable. */
  giveaway: number;
  /** Everything above. The figure to render as "your DHB". */
  total: number;
  /** True until the wallet half has resolved. */
  isLoading: boolean;
}

/**
 * Sum every staked row the API reports for an account.
 *
 * Not filtered by chain. `balanceData` carries a row per chain the backend
 * tracks and only the staking chains ever report a non-zero `staked`, so a
 * filter would buy nothing today and would silently drop a third chain's
 * staking the day one is added.
 */
export function stakedFromBalanceData(
  rows: Array<{ staked?: number }> | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => {
    const staked = Number(row?.staked);
    return Number.isFinite(staked) ? sum + staked : sum;
  }, 0);
}

/** Sum the DHB rows out of a mixed multi-chain token list. */
function walletDhbFrom(tokens: Array<{ symbol: string; formattedBalance: string }>): number {
  return tokens.reduce((sum, token) => {
    if (token.symbol !== 'DHB') return sum;
    const value = parseFloat(token.formattedBalance);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

export function useDhbHoldings(): DhbHoldings {
  const { walletAddress, isAuthenticated } = useAuth();
  const { allTokens, isLoading } = useAllChainsTokens();

  // One query per address, shared through the react-query cache, so the wallet
  // page and the Settings row cost a single request between them.
  const { data: staked = 0 } = useQuery({
    queryKey: [DHB_STAKED_QUERY_KEY, walletAddress?.toLowerCase() ?? null],
    queryFn: async () => {
      const account = await getAccountInfo(walletAddress!);
      return stakedFromBalanceData(account?.balanceData);
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A missed staked figure reads as "you have less than you do", so it is
    // worth one retry — but not a storm against a backend that throttles.
    retry: 1,
  });

  const wallet = useMemo(() => walletDhbFrom(allTokens), [allTokens]);
  const giveaway = getGiveawayPrizeFor(walletAddress)?.amount ?? 0;

  return {
    wallet,
    staked,
    giveaway,
    total: wallet + staked + giveaway,
    isLoading,
  };
}
