import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionCredits } from '@/hooks/use-subscription-credits';
import { isSmartWalletSession } from '@/lib/connection-source';
import { coinKey, fetchTopUpCoins, payableCoins, readCoinBalances, type TopUpCoin } from '@/lib/coin-topup';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, getChainConfig } from '@/lib/contracts/dhb-token';

/** Creator prices are DHB at the peg, so DHB counts at $0.001 here too. */
const USD_PER_DHB = 0.001;

/**
 * Dollars this wallet can spend on the creator page right now: the Studio
 * balance, DHB on Base and BNB Chain, and every other coin a job can be paid
 * with (USDT, USDC, BNB, ETH, USDFC). Shown in the header chip on /creator.
 */
export function useUsableUsd() {
  const { walletAddress, isAuthenticated } = useAuth();
  const { data: credits } = useSubscriptionCredits();
  const wallet = walletAddress?.toLowerCase();

  const query = useQuery({
    queryKey: ['usable-usd', wallet],
    enabled: !!wallet && isAuthenticated,
    staleTime: 60_000,
    queryFn: async () => {
      const coins = payableCoins(await fetchTopUpCoins().catch(() => []), isSmartWalletSession());
      const dhb: TopUpCoin[] = [BASE_CHAIN_ID, BNB_CHAIN_ID].map((chainId) => ({
        symbol: 'USDT', // shape only; priced below
        chainId,
        address: getChainConfig(chainId as never).dhbToken,
        decimals: 18,
        priceUsd: USD_PER_DHB,
        treasuryAddress: '',
      }));
      const [coinBalances, dhbBalances] = await Promise.all([
        readCoinBalances(coins, wallet!),
        readCoinBalances(dhb, wallet!),
      ]);
      const coinsUsd = coins.reduce((sum, coin) => sum + (coinBalances[coinKey(coin)] || 0) * coin.priceUsd, 0);
      const dhbUnits = Object.values(dhbBalances).reduce<number>((sum, v) => sum + (v || 0), 0);
      return coinsUsd + dhbUnits * USD_PER_DHB;
    },
  });

  const studio = credits?.usd || 0;
  return {
    usd: query.data == null ? null : query.data + studio,
    studioUsd: studio,
    isLoading: query.isLoading,
  };
}
