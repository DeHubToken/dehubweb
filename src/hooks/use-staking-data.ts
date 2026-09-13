/**
 * Hook for fetching staking page data
 */
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { fetchStakingStats, getUserLegacyStake, getUserEarnedBNB, getStakingAllowance } from '@/lib/contracts/staking';
import { useTokenPrices } from './use-token-prices';
import { stakedFromBalanceData } from './use-dhb-holdings';
import { getAccountInfo } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';
import { fromWei, CHAIN_CONFIGS, BNB_CHAIN_ID, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { readContract } from '@/lib/contracts/aa-utils';
import { useAuth } from '@/contexts/AuthContext';
import { Interface } from 'ethers';
import type { ChainId } from '@/components/app/ChainSelector';
import { legacyWalletAddresses } from '@/lib/legacy-wallet-addresses';

export interface UnstakeEvent {
  wallet: string;
  amount: string;
  txHash: string;
  timestamp: number;
  chain: 'BNB' | 'Base';
}

const erc20BalanceInterface = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
]);

/**
 * True for a row that is still a *request* rather than a settled withdrawal.
 *
 * Queue rows are written with a synthetic `unstake-request-<ts>` hash and wait
 * on a manual treasury payout. A withdrawal from the legacy BNB contract lands
 * with its real transaction hash and has already moved the tokens, so counting
 * one as queued would subtract the same DHB twice — once on-chain and once here.
 */
function isPendingQueueRow(txHash: string | null | undefined): boolean {
  return !(txHash ?? '').startsWith('0x');
}

async function fetchUnstakeQueue(): Promise<UnstakeEvent[]> {
  try {
    const { data, error } = await supabase
      .from('staking_records')
      .select('wallet_address, amount, tx_hash, created_at, chain')
      .eq('action', 'unstake')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.filter(r => isPendingQueueRow(r.tx_hash)).map((r): UnstakeEvent => ({
      wallet: r.wallet_address,
      amount: String(r.amount),
      txHash: r.tx_hash,
      timestamp: new Date(r.created_at).getTime() / 1000,
      chain: (r.chain === 'BNB' ? 'BNB' : 'Base') as 'BNB' | 'Base',
    }));
  } catch (err) {
    console.error('[Staking] Failed to fetch unstake queue:', err);
    return [];
  }
}

export function useStakingStats() {
  const isStakeRouteActive = useIsStakeRouteActive();
  return useQuery({
    queryKey: ['staking-stats'],
    queryFn: async () => {
      const stats = await fetchStakingStats();
      return {
        bnbStaked: fromWei(stats.bnbStaked),
        baseStaked: fromWei(stats.baseStaked),
        totalStaked: fromWei(stats.totalStaked),
        bnbStakedRaw: stats.bnbStaked,
        baseStakedRaw: stats.baseStaked,
        totalStakedRaw: stats.totalStaked,
      };
    },
    staleTime: 60_000,
    // Route-gated like useUserStakingData below — StakingPage never unmounts,
    // so an unconditional interval would poll for the rest of the session.
    refetchInterval: isStakeRouteActive ? 120_000 : false,
  });
}

/** True while the user is actually on the staking page (reactive). */
export function useIsStakeRouteActive(): boolean {
  const { pathname } = useLocation();
  return pathname === '/stake' || pathname === '/app/stake';
}

/**
 * Get user's unstaked DHB balance on a specific chain
 */
export async function getUserDHBBalance(userAddress: string, chainId: ChainId): Promise<bigint> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config?.dhbToken) return BigInt(0);
  
  // For BNB staking, the DHB token address might differ
  const tokenAddress = chainId === BNB_CHAIN_ID
    ? '0x680d3113caf77b61b510f332d5ef4cf5b41a761d'
    : config.dhbToken;

  try {
    return await readContract<bigint>(
      tokenAddress,
      erc20BalanceInterface,
      'balanceOf',
      [userAddress],
      chainId
    );
  } catch {
    return BigInt(0);
  }
}

export interface UserStakingData {
  // BNB
  bnbStaked: string;
  bnbStakedRaw: bigint;
  bnbBalance: string;
  bnbBalanceRaw: bigint;
  bnbEarned: string;
  bnbEarnedRaw: bigint;
  bnbAllowance: bigint;
  /**
   * The slice of `totalStaked` sitting in the legacy BNB contract — the only
   * part a user can withdraw themselves. Everything else is in the transfer
   * pool, which is a wallet with no `unstake()` behind it.
   */
  legacyStaked: number;
  legacyStakedRaw: bigint;
  /** Unix seconds the legacy position unlocks; before it, withdrawing costs a fee. */
  legacyUnlockAt: number;
  // Base
  baseBalance: string;
  baseBalanceRaw: bigint;
  // Combined
  totalStaked: number;
  totalUnstaked: number;
  totalUnstakeQueued: number;
  hasBNBBalance: boolean;
  hasBaseBalance: boolean;
  hasBothChains: boolean;
  userAddress: string;
}

export function useUserStakingData() {
  const { walletAddress, isAuthenticated } = useAuth();
  // Reactive route check — the surfaces that display this data live at
  // /stake, /app/stake and /app/wallet. useLocation re-renders on navigation,
  // so the interval below flips on/off as the user moves around the app.
  const { pathname } = useLocation();
  const isStakingSurfaceActive =
    pathname === '/stake' || pathname === '/app/stake' || pathname === '/app/wallet';

  return useQuery({
    queryKey: ['user-staking-data', walletAddress?.toLowerCase()],
    queryFn: async (): Promise<UserStakingData | null> => {
      if (!walletAddress) return null;

      const addr = walletAddress.toLowerCase();

      // Fetch on-chain balances, legacy contract stake, transfer-based stake
      // sums (both chains) + DB staking records in parallel
      const legacyAddresses = await legacyWalletAddresses(walletAddress);

      const [
        bnbBalanceRaw,
        baseBalanceRaw,
        bnbEarnedRaw,
        bnbAllowance,
        legacyPositions,
        account,
        { data: stakingRecords },
      ] = await Promise.all([
        getUserDHBBalance(walletAddress, BNB_CHAIN_ID),
        getUserDHBBalance(walletAddress, BASE_CHAIN_ID),
        getUserEarnedBNB(walletAddress),
        getStakingAllowance(walletAddress),
        Promise.all(legacyAddresses.map(address => getUserLegacyStake(address))),
        getAccountInfo(walletAddress).catch((err) => {
          console.error('[Staking] account read failed:', err);
          return null;
        }),
        supabase
          .from('staking_records')
          .select('amount, action, tx_hash')
          .eq('wallet_address', addr),
      ]);

      // DB sums: a last-resort staked figure, and the source of the pending
      // unstake queue (unstake requests await manual payout).
      let dbStaked = 0;
      let dbUnstakeTotal = 0;
      if (stakingRecords) {
        for (const r of stakingRecords) {
          if (r.action === 'stake') dbStaked += Number(r.amount);
          else if (r.action === 'unstake' && isPendingQueueRow(r.tx_hash)) {
            dbStaked -= Number(r.amount);
            dbUnstakeTotal += Number(r.amount);
          }
        }
      }
      if (dbStaked < 0) dbStaked = 0;

      // A pre-migration position may belong to the raw owner EOA while the
      // current DeHub session uses its deterministic Safe (or vice versa).
      // Both addresses are controlled by the same recovered wallet key.
      const legacyPosition = legacyPositions.reduce(
        (best, position) => position.amountRaw > best.amountRaw ? position : best,
        { amountRaw: BigInt(0), unlockAt: 0 },
      );
      const legacyStakedNum = parseFloat(fromWei(legacyPosition.amountRaw));

      let totalStakedNum: number;
      let unstakeQueuedNum: number;
      if (account) {
        // The backend's figure: the legacy contract plus the transfer-pool
        // ledger, which it derives from the DHB transfer log. Same source as
        // the badge ladder, the leaderboard and the wallet page — see
        // use-dhb-holdings for why this is not re-derived in the browser.
        //
        // It used to be, and the subtraction it made was wrong: a queued
        // unstake is settled by hand from a treasury address, so the pool's
        // own outbound log never shows one and the browser deducted DHB that
        // had never moved. The queue below is what is still owed, not
        // something to take off the position.
        const serverStaked = stakedFromBalanceData(account.balanceData);
        totalStakedNum = Math.max(serverStaked, legacyStakedNum);
        unstakeQueuedNum = dbUnstakeTotal;
      } else {
        // The API is unreachable — fall back to DB-derived accounting
        totalStakedNum = dbStaked + legacyStakedNum;
        unstakeQueuedNum = dbUnstakeTotal;
      }

      const bnbBalance = fromWei(bnbBalanceRaw);
      const baseBalance = fromWei(baseBalanceRaw);
      const bnbEarned = fromWei(bnbEarnedRaw);

      const bnbBalNum = parseFloat(bnbBalance);
      const baseBalNum = parseFloat(baseBalance);

      return {
        bnbStaked: totalStakedNum.toString(),
        bnbStakedRaw: legacyPosition.amountRaw,
        bnbBalance,
        bnbBalanceRaw,
        bnbEarned,
        bnbEarnedRaw,
        bnbAllowance,
        legacyStaked: legacyStakedNum,
        legacyStakedRaw: legacyPosition.amountRaw,
        legacyUnlockAt: legacyPosition.unlockAt,
        baseBalance,
        baseBalanceRaw,
        totalStaked: totalStakedNum,
        totalUnstaked: bnbBalNum + baseBalNum,
        totalUnstakeQueued: unstakeQueuedNum,
        hasBNBBalance: bnbBalNum > 0,
        hasBaseBalance: baseBalNum > 0,
        hasBothChains: bnbBalNum > 0 && baseBalNum > 0,
        userAddress: walletAddress,
      };
    },
    enabled: !!walletAddress && isAuthenticated,
    // StakingPage/FullWalletPage stay mounted for the whole session
    // (PersistentPageCache), so a bare interval here runs forever once either
    // page is visited, and each tick is six parallel reads. Route-gate it:
    // poll only while the user is actually LOOKING at stake/wallet; elsewhere
    // it stops entirely. Returning to the page refetches immediately
    // (staleTime 15s) and the interval restarts via the reactive pathname.
    staleTime: 15_000,
    refetchInterval: isStakingSurfaceActive ? 30_000 : false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: isStakingSurfaceActive,
  });
}

// Keep backward compat
export function useUserBNBStaking() {
  const { data, ...rest } = useUserStakingData();
  return {
    data: data ? {
      staked: data.bnbStaked,
      stakedRaw: data.bnbStakedRaw,
      earned: data.bnbEarned,
      earnedRaw: data.bnbEarnedRaw,
      allowance: data.bnbAllowance,
      userAddress: data.userAddress,
    } : undefined,
    ...rest,
  };
}

export function useUnstakeQueue() {
  const isStakeRouteActive = useIsStakeRouteActive();
  return useQuery({
    queryKey: ['unstake-queue'],
    queryFn: fetchUnstakeQueue,
    staleTime: 60_000,
    refetchInterval: isStakeRouteActive ? 120_000 : false,
  });
}

export function useStakingTVL() {
  const { data: stats } = useStakingStats();
  const { data: prices } = useTokenPrices();
  
  const dhbPrice = prices?.DHB ?? 0;
  const totalStakedNum = stats ? parseFloat(stats.totalStaked) : 0;
  const tvl = totalStakedNum * dhbPrice;

  return { tvl, dhbPrice, totalStakedNum };
}
