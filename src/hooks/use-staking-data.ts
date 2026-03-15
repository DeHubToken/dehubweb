/**
 * Hook for fetching staking page data
 */
import { useQuery } from '@tanstack/react-query';
import { fetchStakingStats, getUserStakedBNB, getUserEarnedBNB, getStakingAllowance } from '@/lib/contracts/staking';
import { useTokenPrices } from './use-token-prices';
import { supabase } from '@/integrations/supabase/client';
import { fromWei, CHAIN_CONFIGS, BNB_CHAIN_ID, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { readContract } from '@/lib/contracts/aa-utils';
import { useAuth } from '@/contexts/AuthContext';
import { Interface } from 'ethers';
import type { ChainId } from '@/components/app/ChainSelector';

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

async function fetchUnstakeQueue(): Promise<UnstakeEvent[]> {
  try {
    const { data, error } = await supabase
      .from('staking_records')
      .select('wallet_address, amount, tx_hash, created_at, chain')
      .eq('action', 'unstake')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.map((r): UnstakeEvent => ({
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
    refetchInterval: 120_000,
  });
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

  return useQuery({
    queryKey: ['user-staking-data', walletAddress?.toLowerCase()],
    queryFn: async (): Promise<UserStakingData | null> => {
      if (!walletAddress) return null;

      const addr = walletAddress.toLowerCase();

      // Fetch on-chain balances + DB staking records in parallel
      const [bnbBalanceRaw, baseBalanceRaw, bnbEarnedRaw, bnbAllowance, { data: stakingRecords }] = await Promise.all([
        getUserDHBBalance(walletAddress, BNB_CHAIN_ID),
        getUserDHBBalance(walletAddress, BASE_CHAIN_ID),
        getUserEarnedBNB(walletAddress),
        getStakingAllowance(walletAddress),
        supabase
          .from('staking_records')
          .select('amount, action')
          .eq('wallet_address', addr),
      ]);

      // Calculate net staked and total unstake-queued from DB records
      let dbStaked = 0;
      let dbUnstakeQueued = 0;
      if (stakingRecords) {
        for (const r of stakingRecords) {
          if (r.action === 'stake') dbStaked += Number(r.amount);
          else if (r.action === 'unstake') {
            dbStaked -= Number(r.amount);
            dbUnstakeQueued += Number(r.amount);
          }
        }
      }
      if (dbStaked < 0) dbStaked = 0;

      // Also check legacy BNB contract staked balance
      let legacyStaked = BigInt(0);
      try {
        legacyStaked = await getUserStakedBNB(walletAddress);
      } catch {}

      const legacyStakedNum = parseFloat(fromWei(legacyStaked));
      const totalStakedNum = dbStaked + legacyStakedNum;

      const bnbBalance = fromWei(bnbBalanceRaw);
      const baseBalance = fromWei(baseBalanceRaw);
      const bnbEarned = fromWei(bnbEarnedRaw);

      const bnbBalNum = parseFloat(bnbBalance);
      const baseBalNum = parseFloat(baseBalance);

      return {
        bnbStaked: totalStakedNum.toString(),
        bnbStakedRaw: legacyStaked,
        bnbBalance,
        bnbBalanceRaw,
        bnbEarned,
        bnbEarnedRaw,
        bnbAllowance,
        baseBalance,
        baseBalanceRaw,
        totalStaked: totalStakedNum,
        totalUnstaked: bnbBalNum + baseBalNum,
        totalUnstakeQueued: dbUnstakeQueued,
        hasBNBBalance: bnbBalNum > 0,
        hasBaseBalance: baseBalNum > 0,
        hasBothChains: bnbBalNum > 0 && baseBalNum > 0,
        userAddress: walletAddress,
      };
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
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
  return useQuery({
    queryKey: ['unstake-queue'],
    queryFn: fetchUnstakeQueue,
    staleTime: 60_000,
    refetchInterval: 120_000,
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
