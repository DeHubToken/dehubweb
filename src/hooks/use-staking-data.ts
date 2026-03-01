/**
 * Hook for fetching staking page data
 */
import { useQuery } from '@tanstack/react-query';
import { fetchStakingStats, getUserStakedBNB, getUserEarnedBNB, getStakingAllowance } from '@/lib/contracts/staking';
import { useTokenPrices } from './use-token-prices';
import { supabase } from '@/integrations/supabase/client';
import { fromWei } from '@/lib/contracts/dhb-token';
import { getWalletAddress } from '@/lib/contracts/aa-utils';

export interface UnstakeEvent {
  wallet: string;
  amount: string;       // human-readable
  txHash: string;
  timestamp: number;
  chain: 'BNB' | 'Base';
}

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

export function useUserBNBStaking() {
  return useQuery({
    queryKey: ['user-bnb-staking'],
    queryFn: async () => {
      let userAddress: string;
      try {
        userAddress = await getWalletAddress();
      } catch {
        return null;
      }

      const [stakedRaw, earnedRaw, allowanceRaw] = await Promise.all([
        getUserStakedBNB(userAddress),
        getUserEarnedBNB(userAddress),
        getStakingAllowance(userAddress),
      ]);

      return {
        staked: fromWei(stakedRaw),
        stakedRaw,
        earned: fromWei(earnedRaw),
        earnedRaw,
        allowance: allowanceRaw,
        userAddress,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
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
