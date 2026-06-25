/**
 * PPV Payment Hook
 * ================
 * Pay-Per-View unlock via StreamController.sendFundsForPPV (#44).
 * Auto-swaps ETH → DHB on Base when balance is low.
 * Optional atomic swap + PPV + tip via DeHubPaymentRouter when deployed (#45).
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import {
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, fromWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import {
  isAutoSwapSupported,
  getSwapQuote,
  applySlippage,
  swapETHForDHB,
  getNativeBalance,
} from '@/lib/contracts/uniswap-swap';
import { sendFundsForPPV } from '@/lib/contracts/stream-controller';
import {
  isPaymentRouterAvailable,
  unlockPPVAndTipViaRouter,
} from '@/lib/contracts/payment-router';
import { confirmPPVPurchase, getPaymentConfig } from '@/lib/api/dehub/payments';
import { markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';

interface UsePPVPaymentOptions {
  tokenId: string;
  creatorAddress?: string;
  price: number;
  currency?: string;
  chainId?: ChainId;
  /** Optional tip in DHB — uses payment router for atomic tx when deployed (#45) */
  tipAmount?: number;
  onSuccess?: () => void;
}

export function usePPVPayment({
  tokenId,
  creatorAddress,
  price,
  currency = 'DHB',
  chainId = BASE_CHAIN_ID,
  tipAmount = 0,
  onSuccess,
}: UsePPVPaymentOptions) {
  const [isPaying, setIsPaying] = useState(false);
  const { walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();

  const pay = useCallback(async () => {
    if (!walletAddress) {
      openLoginModal?.();
      return;
    }

    if (!creatorAddress) {
      toast.error('Creator address not available');
      return;
    }

    if (price <= 0) {
      toast.error('Invalid PPV price');
      return;
    }

    if (currency !== 'DHB') {
      toast.error('Only DHB PPV payments are supported on-chain');
      return;
    }

    setIsPaying(true);

    try {
      const chainConfig = getChainConfig(chainId);
      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      if (signerAddress.toLowerCase() === creatorAddress.toLowerCase()) {
        toast.error('You cannot unlock your own content');
        setIsPaying(false);
        return;
      }

      let paymentConfig;
      try {
        paymentConfig = await getPaymentConfig();
      } catch {
        paymentConfig = null;
      }

      const chainPayment = paymentConfig?.chains?.find((c) => c.chainId === chainId);
      const routerAddress = chainPayment?.paymentRouter;
      const useRouter =
        tipAmount > 0 && isPaymentRouterAvailable(chainId, routerAddress);

      let txHash: string;

      if (useRouter && routerAddress) {
        toast.loading(dhbText('Processing atomic payment (swap + unlock + tip)...'), { id: 'ppv-payment' });
        const result = await unlockPPVAndTipViaRouter({
          routerAddress,
          tokenId,
          ppvAmount: price,
          tipAmount,
          creator: creatorAddress,
          chainId,
        });
        txHash = result.hash;
      } else {
        const amountWei = toWei(price, DHB_TOKEN.decimals);
        let dhbBalance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

        if (dhbBalance < amountWei) {
          const shortfall = amountWei - dhbBalance;

          if (!isAutoSwapSupported(chainId)) {
            const balanceHuman = fromWei(dhbBalance);
            toast.error(
              dhbText(`Insufficient DHB. Need ${price} DHB but have ${balanceHuman} DHB. Auto-swap is only on Base.`),
            );
            setIsPaying(false);
            return;
          }

          toast.loading('Getting swap quote...', { id: 'ppv-payment' });
          const ethQuoteResult = await getSwapQuote(shortfall);

          if (!ethQuoteResult) {
            toast.error(dhbText('Could not get swap quote. Please acquire DHB manually.'), { id: 'ppv-payment' });
            setIsPaying(false);
            return;
          }

          const ethNeeded = applySlippage(ethQuoteResult.amountIn);
          const ethBalance = await getNativeBalance(signerAddress, chainId);

          if (ethBalance < ethNeeded) {
            toast.error(
              dhbText(
                `Insufficient DHB and ETH. Need ~${fromWei(ethNeeded)} ETH for auto-swap but have ${fromWei(ethBalance)} ETH.`,
              ),
              { id: 'ppv-payment' },
            );
            setIsPaying(false);
            return;
          }

          toast.loading(dhbText('Swapping ETH → DHB...'), { id: 'ppv-payment' });
          await swapETHForDHB(shortfall, ethNeeded, signerAddress);
          dhbBalance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

          if (dhbBalance < amountWei) {
            toast.error(dhbText('Swap completed but DHB balance still insufficient. Try again.'), { id: 'ppv-payment' });
            setIsPaying(false);
            return;
          }
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
      }

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
      const message = parseTxError(error);
      toast.error(message || 'PPV payment failed', { id: 'ppv-payment' });
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
    tokenId,
    tipAmount,
    openLoginModal,
    onSuccess,
    queryClient,
  ]);

  return { pay, isPaying };
}
