/**
 * PPV Payment Hook
 * ================
 * Handles Pay-Per-View content unlock via DHB ERC20 transfer.
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
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { useAuth } from '@/contexts/AuthContext';
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
      const chainConfig = getChainConfig(chainId);
      
      // Switch to correct chain
      await switchChain(chainId);
      
      const signerAddress = await getWalletAddress();
      
      // Check balance
      const amountWei = toWei(price, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);
      
      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        toast.error(`Insufficient DHB balance. Need ${price} DHB but have ${balanceHuman.toFixed(2)} DHB`);
        setIsPaying(false);
        return;
      }

      // Execute ERC20 transfer to creator
      toast.loading('Processing PPV payment...', { id: 'ppv-payment' });
      
      const result = await writeContractAA(
        chainConfig.dhbToken,
        erc20TransferInterface,
        'transfer',
        [creatorAddress, amountWei],
        { context: 'PPV unlock payment', chainId }
      );

      const receipt = await result.wait(1);
      
      toast.success('Content unlocked! 🎉', { id: 'ppv-payment' });
      console.log('[PPV] Payment confirmed:', receipt.hash);
      
      onSuccess?.();
    } catch (error: any) {
      console.error('[PPV] Payment failed:', error);
      const message = parseTxError(error);
      toast.error(message || 'PPV payment failed', { id: 'ppv-payment' });
    } finally {
      setIsPaying(false);
    }
  }, [walletAddress, creatorAddress, price, chainId, openLoginModal, onSuccess]);

  return { pay, isPaying };
}
