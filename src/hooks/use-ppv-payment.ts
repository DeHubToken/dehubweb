/**
 * PPV Payment Hook
 * ================
 * Handles Pay-Per-View content unlock via DHB ERC20 transfer.
 * Auto-swaps ETH → DHB via Uniswap V3 on Base when user lacks DHB.
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Interface } from 'ethers';
import { 
  writeContractAA, 
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
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import type { ChainId } from '@/components/app/ChainSelector';

const erc20TransferInterface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

interface UsePPVPaymentOptions {
  tokenId: string;
  creatorAddress?: string;
  price: number;
  currency?: string;
  chainId?: ChainId;
  onSuccess?: () => void;
}

export function usePPVPayment({
  tokenId,
  creatorAddress,
  price,
  currency = 'DHB',
  chainId = BASE_CHAIN_ID,
  onSuccess,
}: UsePPVPaymentOptions) {
  const [isPaying, setIsPaying] = useState(false);
  const { walletAddress, openLoginModal } = useAuth();

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

    setIsPaying(true);

    try {
      // Check if already purchased
      const { count } = await supabase
        .from('ppv_purchases')
        .select('*', { count: 'exact', head: true })
        .eq('token_id', tokenId)
        .eq('buyer_address', walletAddress.toLowerCase());

      if (count && count > 0) {
        toast.success('Content already unlocked! 🎉', { id: 'ppv-payment' });
        onSuccess?.();
        setIsPaying(false);
        return;
      }

      const chainConfig = getChainConfig(chainId);
      
      // Switch to correct chain
      await switchChain(chainId);
      
      const signerAddress = await getWalletAddress();
      
      // Check DHB balance
      const amountWei = toWei(price, DHB_TOKEN.decimals);
      const dhbBalance = await getERC20Balance(chainConfig.dhbToken, signerAddress);
      
      // ── Auto-swap if insufficient DHB ────────────────────────
      if (dhbBalance < amountWei) {
        const shortfall = amountWei - dhbBalance;
        
        // Only Base supports auto-swap via Uniswap
        if (!isAutoSwapSupported(chainId)) {
          const balanceHuman = fromWei(dhbBalance);
          toast.error(`Insufficient DHB balance. Need ${price} DHB but have ${balanceHuman} DHB. Auto-swap is only available on Base.`);
          setIsPaying(false);
          return;
        }

        // Get Uniswap quote for the shortfall
        toast.loading('Getting swap quote...', { id: 'ppv-payment' });
        const ethQuote = await getSwapQuote(shortfall);
        
        if (!ethQuote) {
          toast.error('Could not get swap quote. Please acquire DHB manually.', { id: 'ppv-payment' });
          setIsPaying(false);
          return;
        }

        const ethNeeded = applySlippage(ethQuote);
        const ethBalance = await getNativeBalance(signerAddress, chainId);

        if (ethBalance < ethNeeded) {
          const ethHuman = fromWei(ethBalance);
          const ethRequired = fromWei(ethNeeded);
          toast.error(
            `Insufficient DHB and ETH. Need ~${ethRequired} ETH for auto-swap but have ${ethHuman} ETH.`,
            { id: 'ppv-payment' }
          );
          setIsPaying(false);
          return;
        }

        // Execute swap
        toast.loading('Swapping ETH → DHB...', { id: 'ppv-payment' });
        try {
          await swapETHForDHB(shortfall, ethNeeded, signerAddress);
          console.log('[PPV] Auto-swap complete, proceeding with payment');
        } catch (swapError: any) {
          console.error('[PPV] Auto-swap failed:', swapError);
          const msg = parseTxError(swapError);
          toast.error(msg || 'ETH → DHB swap failed', { id: 'ppv-payment' });
          if (msg.toLowerCase().includes('session expired') || msg.toLowerCase().includes('log in again')) {
            setTimeout(() => openLoginModal?.(), 1200);
          }
          setIsPaying(false);
          return;
        }
      }

      // ── Execute ERC20 transfer to creator ────────────────────
      toast.loading('Processing PPV payment...', { id: 'ppv-payment' });
      
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [creatorAddress, amountWei],
        { context: 'PPV unlock payment', chainId }
      );

      const receipt = await result.wait(1);
      
      // Record purchase in database
      try {
        const query = supabase.from('ppv_purchases').upsert({
          token_id: tokenId,
          buyer_address: signerAddress.toLowerCase(),
          creator_address: creatorAddress.toLowerCase(),
          amount: price,
          currency,
          chain_id: chainId,
          tx_hash: receipt.hash,
        }, { onConflict: 'token_id,buyer_address' });
        await withWalletHeader(query, signerAddress);
      } catch (e) {
        console.warn('[PPV] Failed to record purchase:', e);
      }
      
      toast.success('Content unlocked! 🎉', { id: 'ppv-payment' });
      console.log('[PPV] Payment confirmed:', receipt.hash);
      
      onSuccess?.();
    } catch (error: any) {
      console.error('[PPV] Payment failed:', error);
      const message = parseTxError(error);
      toast.error(message || 'PPV payment failed', { id: 'ppv-payment' });
      // Session expired → auto-open login modal so user can re-auth and retry
      if (message.toLowerCase().includes('session expired') || message.toLowerCase().includes('log in again')) {
        setTimeout(() => openLoginModal?.(), 1200);
      }
    } finally {
      setIsPaying(false);
    }
  }, [walletAddress, creatorAddress, price, currency, chainId, tokenId, openLoginModal, onSuccess]);

  return { pay, isPaying };
}
