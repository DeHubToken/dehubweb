/**
 * Tip Payment Hook
 * ================
 * Handles tipping creators via DHB ERC20 transfer.
 * Same pattern as usePPVPayment but amount is user-specified.
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

export const MIN_TIP_DHB = 0.1;
export const MAX_TIP_DHB = 100000;

interface UseTipPaymentOptions {
  creatorAddress?: string;
  chainId?: ChainId;
  onSuccess?: () => void;
}

export function useTipPayment({
  creatorAddress,
  chainId = BASE_CHAIN_ID,
  onSuccess,
}: UseTipPaymentOptions) {
  const [isTipping, setIsTipping] = useState(false);
  const { walletAddress, openLoginModal } = useAuth();

  const tip = useCallback(
    async (amount: number) => {
      if (!walletAddress) {
        openLoginModal?.();
        return;
      }

      if (!creatorAddress) {
        toast.error('Creator address not available');
        return;
      }

      if (amount < MIN_TIP_DHB || amount > MAX_TIP_DHB) {
        toast.error(`Amount must be between ${MIN_TIP_DHB} and ${MAX_TIP_DHB} DHB`);
        return;
      }

      setIsTipping(true);

      try {
        const chainConfig = getChainConfig(chainId);

        await switchChain(chainId);

        const signerAddress = await getWalletAddress();

        const amountWei = toWei(amount, DHB_TOKEN.decimals);
        const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

        if (balance < amountWei) {
          const balanceHuman = Number(balance) / 1e18;
          toast.error(
            `Insufficient DHB balance. Need ${amount} DHB but have ${balanceHuman.toFixed(2)} DHB`
          );
          setIsTipping(false);
          return;
        }

        toast.loading('Sending tip...', { id: 'tip-payment' });

        const result = await writeContractAA(
          chainConfig.dhbToken,
          erc20TransferInterface,
          'transfer',
          [creatorAddress, amountWei],
          { context: 'Creator tip', chainId }
        );

        await result.wait(1);

        toast.success(`Tip of ${amount} DHB sent! 🎉`, { id: 'tip-payment' });
        onSuccess?.();
      } catch (error: unknown) {
        console.error('[Tip] Payment failed:', error);
        const message = parseTxError(error as Error);
        toast.error(message || 'Tip failed', { id: 'tip-payment' });
      } finally {
        setIsTipping(false);
      }
    },
    [walletAddress, creatorAddress, chainId, openLoginModal, onSuccess]
  );

  return { tip, isTipping };
}
