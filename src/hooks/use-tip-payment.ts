/**
 * Tip Payment Hook
 * ================
 * Handles tipping creators via StreamController.sendTip().
 * Uses contract so backend can detect tips via SendFunds event (not direct ERC20 transfer).
 *
 * IMPORTANT: Success toast is only shown AFTER on-chain confirmation AND database persistence.
 * This ensures users never see "Tip sent!" when the record wasn't saved.
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { readConfirmedTipDetails } from '@/lib/contracts/read-tip-transaction';
import { sendTip } from '@/lib/contracts/stream-controller';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';

export const MIN_TIP_DHB = 1;
export const MAX_TIP_DHB = Infinity;

const MAX_DB_RETRIES = 3;

interface UseTipPaymentOptions {
  creatorAddress?: string;
  chainId?: ChainId;
  tokenId?: string;
  onSuccess?: () => void;
  /** Called after on-chain confirmation + DB save succeeds (background) */
  onConfirmed?: () => void;
}

/**
 * Persist tip to database with retries.
 * Returns true if saved successfully, false otherwise.
 */
async function persistTipRecord(
  params: {
    walletAddress: string;
    creatorAddress: string;
    amount: number;
    chainId: ChainId;
    txHash: string;
    tokenId: string | null;
  },
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    const { error } = await withWalletHeader(
      supabase.from('tip_records').insert({
        sender_address: params.walletAddress.toLowerCase(),
        receiver_address: params.creatorAddress.toLowerCase(),
        amount: params.amount,
        chain_id: params.chainId,
        tx_hash: params.txHash,
        token_id: params.tokenId,
      } as any),
      params.walletAddress
    );

    if (!error) return true;

    console.error(`[Tip] DB save attempt ${attempt}/${MAX_DB_RETRIES} failed:`, error);

    if (attempt < MAX_DB_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
}

export function useTipPayment({
  creatorAddress,
  chainId = BASE_CHAIN_ID,
  tokenId,
  onSuccess,
  onConfirmed,
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

      if (walletAddress.toLowerCase() === creatorAddress.toLowerCase()) {
        toast.error("You can't tip yourself!");
        return;
      }

      if (amount < MIN_TIP_DHB || amount > MAX_TIP_DHB) {
        toast.error(dhbText(`Amount must be between ${MIN_TIP_DHB} and ${MAX_TIP_DHB} DHB`));
        return;
      }

      setIsTipping(true);

      try {
        await switchChain(chainId);

        toast.loading('Sending tip...', { id: 'tip-payment' });

        const tipResult = await sendTip({
          tokenId: tokenId || 0,
          amount,
          to: creatorAddress,
          chainId,
          signerAddress: walletAddress,
        });

        // Optimistic: show success immediately after tx submitted
        toast.success(dhbText(`Tip of ${amount} DHB sent!`), { id: 'tip-payment' });
        onSuccess?.();

        // Background: confirm on-chain + persist decoded on-chain values to DB
        (async () => {
          try {
            const confirmedTxHash = await tipResult.confirmed;
            const confirmedTip = await readConfirmedTipDetails(confirmedTxHash, chainId);

            const saved = await persistTipRecord({
              walletAddress,
              creatorAddress: confirmedTip.receiverAddress,
              amount: confirmedTip.amount,
              chainId,
              txHash: confirmedTxHash,
              tokenId: confirmedTip.tokenId,
            });

            if (!saved) {
              console.error('[Tip] All DB save retries failed for tx:', confirmedTxHash);
              toast.error('Tip confirmed on-chain but failed to save. Contact support with tx: ' + confirmedTxHash.slice(0, 10) + '...', {
                duration: 10000,
              });
              return;
            }

            // DB saved — reconcile UI
            onConfirmed?.();
          } catch (err) {
            console.error('[Tip] Background confirmation failed:', err);
          }
        })();
      } catch (error: unknown) {
        console.error('[Tip] Payment failed:', error);
        const message = parseTxError(error as Error);
        toast.error(message || 'Tip failed', { id: 'tip-payment' });
      } finally {
        setIsTipping(false);
      }
    },
    [walletAddress, creatorAddress, chainId, tokenId, openLoginModal, onSuccess, onConfirmed]
  );

  return { tip, isTipping };
}
