/**
 * Tip Payment Hook
 * ================
 * Handles tipping creators via StreamController.sendTip().
 * Uses contract so backend can detect tips via SendFunds event (not direct ERC20 transfer).
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getWalletAddress, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';

export const MIN_TIP_DHB = 1;
export const MAX_TIP_DHB = Infinity;

interface UseTipPaymentOptions {
  creatorAddress?: string;
  chainId?: ChainId;
  tokenId?: string;
  onSuccess?: () => void;
}

export function useTipPayment({
  creatorAddress,
  chainId = BASE_CHAIN_ID,
  tokenId,
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
        await switchChain(chainId);
        const signerAddress = await getWalletAddress();

        toast.loading('Sending tip...', { id: 'tip-payment' });

        const confirmedTxHash = await sendTip({
          tokenId: tokenId || 0,
          amount,
          to: creatorAddress,
          chainId,
        });

        // Record tip in database for leaderboard tracking
        try {
          await withWalletHeader(
            supabase.from('tip_records').insert({
              sender_address: signerAddress.toLowerCase(),
              receiver_address: creatorAddress.toLowerCase(),
              amount,
              chain_id: chainId,
              tx_hash: confirmedTxHash,
              token_id: tokenId || null,
            } as any),
            signerAddress
          );
        } catch (dbErr) {
          console.warn('[Tip] Failed to record tip in DB:', dbErr);
        }

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
    [walletAddress, creatorAddress, chainId, tokenId, openLoginModal, onSuccess]
  );

  return { tip, isTipping };
}
