/**
 * PPV Payment Hook
 * ================
 * Pay-Per-View unlock via StreamController.sendFundsForPPV (#44).
 * A wallet short of DHB hands off to the top-up step, which funds the gap
 * from any token — DeHub Pay first, Uniswap as the fallback.
 *
 * Running out of DHB is a step, not an error. Every shortfall used to end in a
 * toast: the sheet stayed on "Pay 5,000 DHB", the viewer had no way to act on
 * it from where they were standing, and the unlock they had already committed
 * to was simply dropped. Now the gap is reported through `shortfall`, the
 * sheet turns into a top-up step, and `pay()` is re-entrant — so the caller
 * runs it again the moment the wallet is funded, with no second decision and
 * no re-opening the post.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import i18n from 'i18next';
// NOTE: aa-utils / uniswap-swap / stream-controller reach
// wagmi + web3auth. This hook is used by eager feed cards (VideoCard /
// ImageCard PPV drawers), so those modules are dynamically imported inside
// pay() to keep the wallet stack out of the entry bundle
// (scripts/check-entry-bundle.mjs fails the build if it leaks in).
import { DHB_TOKEN, toWei, fromWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { confirmPPVPurchase } from '@/lib/api/dehub/payments';
import { markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { isSolanaChain } from '@/lib/chains/constants';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';

interface UsePPVPaymentOptions {
  tokenId: string;
  creatorAddress?: string;
  price: number;
  currency?: string;
  /**
   * The POST's chain, so this accepts Solana (101/103) as well as the EVM
   * ChainId union — callers pass `post.chainId` straight through.
   */
  chainId?: ChainId | number;
  onSuccess?: () => void;
}

/**
 * An unlock that cannot be sent yet because the wallet is short of DHB.
 *
 * Held as state rather than thrown, because it is the one failure the viewer
 * can fix without leaving the sheet.
 */
export interface PPVShortfall {
  /** DHB the wallet still needs before the unlock can be sent. */
  needDhb: number;
  /** DHB held on the post's chain right now. */
  balanceDhb: number;
  /** The full unlock price. */
  priceDhb: number;
  /** The chain the post settles on. */
  chainId: ChainId;
  /**
   * Whether DHB can be bought from inside the sheet. Uniswap liquidity for DHB
   * is Base-only, so on every other chain the viewer has to bring DHB with
   * them and the step offers funding routes instead of a swap.
   */
  canTopUpInApp: boolean;
}

export function usePPVPayment({
  tokenId,
  creatorAddress,
  price,
  currency = 'DHB',
  chainId: postChainId = BASE_CHAIN_ID,
  onSuccess,
}: UsePPVPaymentOptions) {
  // Everything below the Solana branch in pay() is EVM-only and has already
  // ruled out 101/103, so it can treat the post's chain as a ChainId.
  const chainId = postChainId as ChainId;
  const [isPaying, setIsPaying] = useState(false);
  const [shortfall, setShortfall] = useState<PPVShortfall | null>(null);
  const { walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();

  const clearShortfall = useCallback(() => setShortfall(null), []);

  const pay = useCallback(async () => {
    if (!walletAddress) {
      openLoginModal?.();
      return;
    }

    // A retry after a top-up starts clean: the balance has moved, so last
    // attempt's gap says nothing about this one.
    setShortfall(null);

    if (!creatorAddress) {
      toast.error('Creator address not available');
      return;
    }

    if (price <= 0) {
      toast.error('Invalid PPV price');
      return;
    }

    // Solana posts settle in SOL/SPL through the backend-built transfer, and
    // must branch before any of the EVM plumbing below — getChainConfig(101)
    // throws "Unsupported chain ID", which is what used to happen here.
    if (isSolanaChain(postChainId)) {
      setIsPaying(true);
      try {
        toast.loading('Preparing your payment…', { id: 'ppv-payment', duration: Infinity });
        const { sendSolanaPayment } = await import('@/lib/solana/payment');
        await sendSolanaPayment({ tokenId, kind: 'ppv', chainId: postChainId });

        markTokenUnlocked(tokenId);
        toast.success('Content unlocked!', { id: 'ppv-payment' });
        queryClient.invalidateQueries({ queryKey: ['bookmarks', 'ppv'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        onSuccess?.();
      } catch (error: unknown) {
        console.error('[PPV] Solana payment failed:', error);
        toast.error(
          error instanceof Error ? error.message : 'Solana payment failed',
          { id: 'ppv-payment' },
        );
      } finally {
        setIsPaying(false);
      }
      return;
    }

    if (currency !== 'DHB') {
      toast.error(i18n.t('tokenErrors.ppvTokensOnly'));
      return;
    }

    setIsPaying(true);

    try {
      const [
        { getWalletAddress, getERC20Balance, switchChain },
        { isAutoSwapSupported },
        { sendFundsForPPV },
      ] = await Promise.all([
        import('@/lib/contracts/aa-utils'),
        import('@/lib/contracts/uniswap-swap'),
        import('@/lib/contracts/stream-controller'),
      ]);

      const chainConfig = getChainConfig(chainId);
      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      if (signerAddress.toLowerCase() === creatorAddress.toLowerCase()) {
        toast.error('You cannot unlock your own content');
        setIsPaying(false);
        return;
      }

      let txHash: string;

      const amountWei = toWei(price, DHB_TOKEN.decimals);
      const dhbBalance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

      if (dhbBalance < amountWei) {
        const balanceHuman = Number(fromWei(dhbBalance));
        // Round up, and never to nothing: asking for the exact fractional
        // gap can still leave the wallet a wei short of the price, and a
        // balance that floats to exactly the price would ask to buy zero.
        const needDhb = Math.max(1, Math.ceil(price - balanceHuman));

        // Every branch from here down that cannot pay hands the gap to the
        // sheet instead of a toast. `canTopUpInApp` is what separates "you
        // can fix this in one tap" from "you have to bring DHB with you".
        const raiseShortfall = (canTopUpInApp: boolean) => {
          toast.dismiss('ppv-payment');
          setShortfall({
            needDhb,
            balanceDhb: balanceHuman,
            priceDhb: price,
            chainId,
            canTopUpInApp,
          });
          setIsPaying(false);
        };

        // The top-up step funds the gap from any token, DeHub Pay first and
        // Uniswap only as its fallback. A silent ETH swap here would skip
        // DeHub Pay entirely, so every Base shortfall goes to the step.
        raiseShortfall(isAutoSwapSupported(chainId));
        return;
      }

      toast.loading('Unlocking content...', { id: 'ppv-payment' });
      const ppvResult = await sendFundsForPPV({
        tokenId,
        amount: price,
        to: creatorAddress,
        chainId,
      });
      txHash = ppvResult.hash;
      await ppvResult.confirmed;

      try {
        await confirmPPVPurchase({ tokenId, txHash, chainId });
      } catch (confirmErr) {
        console.warn('[PPV] Backend confirm queued via webhook fallback:', confirmErr);
      }

      markTokenUnlocked(tokenId);
      toast.success('Content unlocked!', { id: 'ppv-payment' });
      console.log('[PPV] Payment confirmed:', txHash);

      queryClient.invalidateQueries({ queryKey: ['bookmarks', 'ppv'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      onSuccess?.();
    } catch (error: unknown) {
      console.error('[PPV] Payment failed:', error);
      // Module is cached after the import above; the fallback only fires if
      // the chunk itself failed to load.
      const aa = await import('@/lib/contracts/aa-utils').catch(() => null);
      const message = aa ? aa.parseTxError(error) : '';
      // Locked wallet: the unlock sheet is already up with its own toast, and
      // nothing has failed — the payment goes through on the next tap.
      if (!aa || !aa.isWalletLockedError(error)) {
        toast.error(message || 'PPV payment failed', { id: 'ppv-payment' });
      }
      if (message.toLowerCase().includes('session expired') || message.toLowerCase().includes('log in again')) {
        setTimeout(() => openLoginModal?.(), 1200);
      }
    } finally {
      setIsPaying(false);
    }
  }, [
    walletAddress,
    creatorAddress,
    price,
    currency,
    chainId,
    postChainId,
    tokenId,
    openLoginModal,
    onSuccess,
    queryClient,
  ]);

  return { pay, isPaying, shortfall, clearShortfall };
}
