/**
 * DefaultChainSync — decides, once per wallet, which chain the app starts on.
 *
 * Renders nothing. New wallets start on BNB Chain; a wallet that already
 * holds tokens on Base keeps Base (lib/chains/default-chain). The Base read
 * only runs until the wallet has a decision, then never again.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { decideDefaultChain, getDecidedDefaultChain, setDefaultChainWallet } from '@/lib/chains/default-chain';

export function DefaultChainSync() {
  const { walletAddress, isAuthenticated } = useAuth();
  const wallet = isAuthenticated && walletAddress ? walletAddress : null;

  useEffect(() => { setDefaultChainWallet(wallet); }, [wallet]);

  const undecided = !!wallet && !getDecidedDefaultChain(wallet);
  // Same key the wallet hooks use, so an already-loaded Base read is reused.
  const { data } = useQuery({
    queryKey: ['wallet-tokens', wallet?.toLowerCase(), BASE_CHAIN_ID],
    queryFn: async () => {
      const [{ getAllTokenBalances }, { readWalletBalance }] = await Promise.all([
        import('@/lib/wallet/tokens'),
        import('@/lib/wallet/read-timeout'),
      ]);
      return readWalletBalance(getAllTokenBalances(wallet!, BASE_CHAIN_ID));
    },
    enabled: undecided,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (wallet && data && undecided) decideDefaultChain(wallet, data);
  }, [wallet, data, undecided]);

  return null;
}
