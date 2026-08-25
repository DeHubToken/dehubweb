/**
 * Fraction Checkout
 * =================
 * Every write in the fraction market that moves value, against the
 * `fraction-checkout` edge function.
 *
 * The rules are the ones live-checkout established for store orders, and they
 * are here for the same reason — the fraction panel used to break all of them:
 *
 * - **The client never prices anything.** The server quotes the DHB amount off
 *   the listing row. The old drawer multiplied in the browser and sent
 *   whatever came out.
 * - **The client never writes a trade.** The server reads the transfer back
 *   off-chain first. Trade rows used to be an open INSERT that any caller
 *   could make, naming any two addresses.
 * - **A quote is not a promise.** The seller's on-chain balance is re-read at
 *   quote time, so a listing whose fractions have since moved is refused
 *   before the buyer pays rather than after.
 *
 * The part that is specific to fractions: a trade is a swap with two legs, and
 * without an escrow contract one of them lands second. So each mutation here
 * settles exactly one leg, and the leg it settles is verified on-chain before
 * the row moves. `useOpenTrades` is the other half — it is what turns "the
 * seller said they would send them" into a tracked obligation with a deadline.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub/core';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import { invalidateFractionQueries, type FractionListing, type FractionOffer, type FractionTrade } from './use-fraction-marketplace';
import type { ChainId } from '@/components/app/ChainSelector';

const logger = createLogger('FractionCheckout');

export interface FractionQuote {
  listingId: string;
  tokenId: string;
  chainId: number;
  quantity: number;
  available: number;
  pricePerFraction: number;
  dhbAmount: number;
  sellerAddress: string;
  /** The seller's live on-chain balance, or null if the read failed. */
  sellerBalance: number | null;
  tokenAddress: string;
  collectionAddress: string;
  settleWindowHours: number;
  /** DHB is ERC20Pausable; a transfer would revert while this is true. */
  paymentsFrozen: boolean;
}

export interface PostSnapshot {
  title?: string;
  imageUrl?: string;
  type?: string;
  creatorAddress?: string;
  creatorUsername?: string;
}

function authHeaders(walletAddress: string | null): Record<string, string> {
  const token = getAuthToken();
  if (!walletAddress || !token) return {};
  return { 'x-wallet-address': walletAddress.toLowerCase(), 'x-dehub-token': token };
}

async function callFraction<T>(
  body: Record<string, unknown>,
  walletAddress: string | null,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fraction-checkout', {
    body,
    headers: authHeaders(walletAddress),
  });
  // A non-2xx from an edge function arrives as `error` with the body attached;
  // surfacing the server's message beats "Edge Function returned a non-2xx".
  if (error) {
    const detail = (data as { error?: string })?.error;
    throw new Error(detail || error.message || 'Request failed');
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/**
 * Submit a settlement leg, retrying while the receipt is still propagating.
 *
 * The transaction is already on-chain by the time this runs. Giving up on the
 * first 202 would strand a real transfer with nothing recording it, so a
 * "not found yet" is a reason to ask again, not a failure — and if it never
 * lands, the hash goes in the error so the user has it to hand.
 */
async function confirmWithRetry<T>(
  body: Record<string, unknown>,
  walletAddress: string | null,
  txHash: string,
  strandedMessage: string,
): Promise<T> {
  let lastError = 'Could not confirm the transaction';
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await callFraction<T>({ ...body, txHash }, walletAddress);
    } catch (err) {
      lastError = (err as Error).message;
      if (!/not found yet/i.test(lastError)) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  logger.error('confirm timed out', { hash: txHash });
  throw new Error(`${lastError}. ${strandedMessage}: ${txHash}`);
}

/**
 * Create a listing.
 *
 * Goes through the server rather than straight to Supabase so the seller's
 * on-chain balance is checked first — including against what they have already
 * listed and what they already owe on an unsettled sale. Without that, the same
 * 100 fractions can back ten listings and nine buyers pay for nothing.
 */
export function useCreateListing() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: (params: {
      tokenId: string;
      quantity: number;
      pricePerFraction: number;
      chainId?: number;
      post?: PostSnapshot;
    }) =>
      callFraction<{ success: boolean; listing: FractionListing; balance: number }>(
        {
          action: 'list',
          tokenId: params.tokenId,
          quantity: params.quantity,
          pricePerFraction: params.pricePerFraction,
          chainId: params.chainId || 8453,
          post: params.post || {},
        },
        walletAddress,
      ),
    onSuccess: (data) => invalidateFractionQueries(queryClient, data.listing?.token_id),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Buy fractions from a listing: quote → pay DHB → server verifies. */
export function useFractionPurchase() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  const getQuote = useMutation({
    mutationFn: (params: { listingId: string; quantity: number }) =>
      callFraction<FractionQuote>(
        { action: 'quote', listingId: params.listingId, quantity: params.quantity },
        walletAddress,
      ),
  });

  const buy = useMutation({
    mutationFn: async (quote: FractionQuote) => {
      if (quote.paymentsFrozen) {
        throw new Error('DHB transfers are paused right now, so this purchase would fail. Try again once trading resumes.');
      }

      // Imported at call time: the fraction panel is reachable from the post
      // page, and scripts/check-entry-bundle.mjs fails the build if the wallet
      // stack lands in the entry chunk.
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const result = await sendERC20Token(
        quote.tokenAddress,
        quote.sellerAddress,
        String(quote.dhbAmount),
        18,
        quote.chainId as ChainId,
      );
      if (!result?.hash) throw new Error('Transaction was not submitted');

      return confirmWithRetry<{ success: boolean; trade: FractionTrade }>(
        { action: 'confirm', listingId: quote.listingId, quantity: quote.quantity },
        walletAddress,
        result.hash,
        'Your payment went through — send this transaction to the seller',
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toast.success('Paid — the seller has been asked to send your fractions');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { getQuote, buy };
}

/**
 * Settle the leg you owe.
 *
 * Both directions land here because they are the same shape: move the thing
 * you owe on-chain, then have the server read it back. Which asset moves is
 * the only difference.
 */
export function useSettleTrade() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  /** Seller side: send the fractions a buyer has already paid for. */
  const deliver = useMutation({
    mutationFn: async (trade: FractionTrade) => {
      if (!walletAddress) throw new Error('Sign in to settle this trade');
      const { transferFractions } = await import('@/lib/contracts/fraction-transfer');
      const result = await transferFractions(
        trade.token_id,
        walletAddress,
        trade.buyer_address,
        trade.quantity,
        (trade.chain_id || 8453) as ChainId,
      );
      if (!result?.hash) throw new Error('Transaction was not submitted');

      return confirmWithRetry<{ success: boolean; trade: FractionTrade }>(
        { action: 'deliver', tradeId: trade.id },
        walletAddress,
        result.hash,
        'The fractions were sent — send this transaction to the buyer',
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toast.success('Delivered — the trade is settled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Buyer side: pay for fractions a seller has already delivered. */
  const pay = useMutation({
    mutationFn: async (params: { trade: FractionTrade; tokenAddress: string }) => {
      const { trade, tokenAddress } = params;
      const { sendERC20Token } = await import('@/lib/wallet/send');
      const result = await sendERC20Token(
        tokenAddress,
        trade.seller_address,
        String(trade.quantity * trade.price_per_fraction),
        18,
        (trade.chain_id || 8453) as ChainId,
      );
      if (!result?.hash) throw new Error('Transaction was not submitted');

      return confirmWithRetry<{ success: boolean; trade: FractionTrade }>(
        { action: 'pay-trade', tradeId: trade.id },
        walletAddress,
        result.hash,
        'Your payment went through — send this transaction to the seller',
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toast.success('Paid — the trade is settled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { deliver, pay };
}

/**
 * Respond to an offer.
 *
 * An offer is an unfunded bid, so accepting means the seller moves first — the
 * mirror of a listing sale. The transfer is verified before the offer is marked
 * accepted, which is what makes the buyer's resulting payment obligation real.
 */
export function useOfferResponse() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  const accept = useMutation({
    mutationFn: async (offer: FractionOffer) => {
      if (!walletAddress) throw new Error('Sign in to accept this offer');
      const { transferFractions } = await import('@/lib/contracts/fraction-transfer');
      const result = await transferFractions(
        offer.token_id,
        walletAddress,
        offer.buyer_address,
        offer.quantity,
        (offer.chain_id || 8453) as ChainId,
      );
      if (!result?.hash) throw new Error('Transaction was not submitted');

      return confirmWithRetry<{ success: boolean; trade: FractionTrade }>(
        { action: 'accept-offer', offerId: offer.id },
        walletAddress,
        result.hash,
        'The fractions were sent — send this transaction to the buyer',
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toast.success('Sent — the buyer has been asked to pay');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (params: { offerId: string; tokenId: string }) =>
      callFraction<{ success: boolean }>(
        { action: 'reject-offer', offerId: params.offerId },
        walletAddress,
      ).then(() => params),
    onSuccess: (params) => {
      invalidateFractionQueries(queryClient, params.tokenId);
      toast.success('Offer rejected');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { accept, reject };
}
