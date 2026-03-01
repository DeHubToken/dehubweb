/**
 * Hook for fetching staking page data
 */
import { useQuery } from '@tanstack/react-query';
import { fetchStakingStats, getUserStakedBNB, getUserEarnedBNB, getStakingAllowance } from '@/lib/contracts/staking';
import { useTokenPrices } from './use-token-prices';
import { supabase } from '@/integrations/supabase/client';
import { fromWei, CHAIN_CONFIGS, BNB_CHAIN_ID, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { getWalletAddress } from '@/lib/contracts/aa-utils';
import { readContract } from '@/lib/contracts/aa-utils';
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
    const { data, error } = await supabase.functions.invoke('get-staking-events', {
      body: { type: 'unstake', limit: 50 },
    });
    if (error) throw error;
    return data?.events ?? [];
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
async function getUserDHBBalance(userAddress: string, chainId: ChainId): Promise<bigint> {
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
  hasBNBBalance: boolean;
  hasBaseBalance: boolean;
  hasBothChains: boolean;
  userAddress: string;
}

export function useUserStakingData() {
  return useQuery({
    queryKey: ['user-staking-data'],
    queryFn: async (): Promise<UserStakingData | null> => {
      let userAddress: string;
      try {
        userAddress = await getWalletAddress();
      } catch {
        return null;
      }

      const [bnbStakedRaw, bnbEarnedRaw, bnbAllowance, bnbBalanceRaw, baseBalanceRaw] = await Promise.all([
        getUserStakedBNB(userAddress),
        getUserEarnedBNB(userAddress),
        getStakingAllowance(userAddress),
        getUserDHBBalance(userAddress, BNB_CHAIN_ID),
        getUserDHBBalance(userAddress, BASE_CHAIN_ID),
      ]);

      const bnbStaked = fromWei(bnbStakedRaw);
      const bnbBalance = fromWei(bnbBalanceRaw);
      const baseBalance = fromWei(baseBalanceRaw);
      const bnbEarned = fromWei(bnbEarnedRaw);

      const bnbBalNum = parseFloat(bnbBalance);
      const baseBalNum = parseFloat(baseBalance);

      return {
        bnbStaked,
        bnbStakedRaw,
        bnbBalance,
        bnbBalanceRaw,
        bnbEarned,
        bnbEarnedRaw,
        bnbAllowance,
        baseBalance,
        baseBalanceRaw,
        totalStaked: parseFloat(bnbStaked), // BNB contract tracks staked; Base is transfer-based
        totalUnstaked: bnbBalNum + baseBalNum,
        hasBNBBalance: bnbBalNum > 0,
        hasBaseBalance: baseBalNum > 0,
        hasBothChains: bnbBalNum > 0 && baseBalNum > 0,
        userAddress,
      };
    },
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
