/**
 * Event Gate Payment Hook
 * =======================
 * Handles paying the gate fee for gated events.
 * Sends DHB to the event creator via StreamController.sendTip(),
 * then records the payment in event_gate_payments.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getWalletAddress, switchChain, parseTxError } from '@/lib/contracts/aa-utils';
import { sendTip } from '@/lib/contracts/stream-controller';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

/** Check if user already paid the gate fee */
export function useHasPaidGate(eventId: string | undefined) {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['event-gate-paid', eventId, walletAddress],
    enabled: !!eventId && !!walletAddress,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_gate_payments' as any)
        .select('id')
        .eq('event_id', eventId!)
        .eq('payer_wallet_address', walletAddress!.toLowerCase())
        .limit(1);
      if (error) throw error;
      return (data as any[])?.length > 0;
    },
  });
}

interface UseEventGatePaymentOptions {
  eventId: string;
  creatorAddress: string;
  amount: number;
  onSuccess?: () => void;
}

export function useEventGatePayment({
  eventId,
  creatorAddress,
  amount,
  onSuccess,
}: UseEventGatePaymentOptions) {
  const [isPaying, setIsPaying] = useState(false);
  const { walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  const chainId = BASE_CHAIN_ID;

  const pay = useCallback(async () => {
    if (!walletAddress) {
      openLoginModal?.();
      return;
    }

    if (walletAddress.toLowerCase() === creatorAddress.toLowerCase()) {
      // Creator doesn't need to pay their own gate
      toast.info("You're the event creator — no fee needed!");
      return;
    }

    setIsPaying(true);
    try {
      await switchChain(chainId);
      const signerAddress = await getWalletAddress();

      toast.loading('Processing payment...', { id: 'gate-payment' });

      const confirmedTxHash = await sendTip({
        tokenId: 0,
        amount,
        to: creatorAddress,
        chainId,
      });

      // Record payment in DB
      await withWalletHeader(
        supabase.from('event_gate_payments' as any).insert({
          event_id: eventId,
          payer_wallet_address: signerAddress.toLowerCase(),
          creator_wallet_address: creatorAddress.toLowerCase(),
          amount,
          tx_hash: confirmedTxHash,
          chain_id: chainId,
        } as any),
        signerAddress
      );

      toast.success(dhbText(`Paid ${amount} DHB entry fee!`), { id: 'gate-payment' });

      queryClient.invalidateQueries({ queryKey: ['event-gate-paid', eventId] });
      onSuccess?.();
    } catch (error: unknown) {
      console.error('[GatePayment] Failed:', error);
      const message = parseTxError(error as Error);
      toast.error(message || 'Payment failed', { id: 'gate-payment' });
    } finally {
      setIsPaying(false);
    }
  }, [walletAddress, creatorAddress, amount, eventId, chainId, openLoginModal, onSuccess, queryClient]);

  return { pay, isPaying };
}
