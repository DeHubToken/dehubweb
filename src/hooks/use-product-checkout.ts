/**
 * Product Checkout
 * ================
 * quote → pay → confirm, against the `live-checkout` edge function.
 *
 * Both commerce surfaces run through here. The live rail passes the stream's
 * tokenId; the marketplace drawer passes null. Server-side the only thing that
 * changes is whether the product has to be attached to that stream — pricing
 * and payment verification are identical either way.
 *
 * Two rules hold this together, and both exist because of what the marketplace
 * drawer used to do instead:
 *
 * - **The client never prices anything.** The server quotes in DHB and returns
 *   503 when the feed is down. The drawer used to compute `priceUsd / dhbPrice`
 *   in the browser, and `useTokenPrices` reports DHB as 0 both before its first
 *   fetch and after a failed one — so a blip in get-dhb-price sent ZERO DHB and
 *   still wrote a paid order that notified the seller. Nothing derived in the
 *   browser is signed now; the USD figures on screen are display only.
 * - **The client never writes the order.** The server reads the transfer back
 *   off Base and inserts the row itself. tx_hash, amount and seller used to
 *   arrive straight from the client, under a policy that only checked the buyer
 *   matched an unsigned header.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub/core';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import type { ChainId } from '@/components/app/ChainSelector';

const logger = createLogger('ProductCheckout');

export interface ProductQuote {
  listingId: string;
  title: string;
  priceUsd: number;
  dhbAmount: number;
  dhbPrice: number;
  sellerAddress: string;
  tokenAddress: string;
  chainId: number;
  isDigital: boolean;
  stockRemaining: number | null;
  /** DHB is ERC20Pausable and currently paused; a transfer would revert. */
  paymentsFrozen: boolean;
}

function authHeaders(walletAddress: string | null): Record<string, string> {
  const token = getAuthToken();
  if (!walletAddress || !token) return {};
  return { 'x-wallet-address': walletAddress.toLowerCase(), 'x-dehub-token': token };
}

/** What the card rail can tell the buyer about a listing. */
export interface CardQuote {
  listingId: string;
  title: string;
  priceUsd: number;
  grossCents: number;
  available: boolean;
  unavailableReason:
    | 'seller_not_onboarded'
    | 'digital_goods'
    | 'below_minimum'
    | 'above_maximum'
    | 'sold_out'
    | 'inactive'
    | 'own_listing'
    | null;
}

export async function callFn<T>(
  fn: 'stream-products' | 'live-checkout' | 'store-checkout',
  body: Record<string, unknown>,
  walletAddress: string | null,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, {
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
 * Buy a store listing.
 *
 * Pass the stream's tokenId to buy from a live rail, or null to buy from the
 * marketplace. The wallet stack is imported at call time: this hook is
 * reachable from the eager live card, and scripts/check-entry-bundle.mjs fails
 * the build if wagmi lands in the entry chunk.
 */
export function useProductCheckout(tokenId: string | null) {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  const getQuote = useMutation({
    mutationFn: (listingId: string) =>
      callFn<ProductQuote>('live-checkout', { action: 'quote', tokenId, listingId }, walletAddress),
  });

  const buy = useMutation({
    mutationFn: async (params: {
      quote: ProductQuote;
      shippingAddress?: string;
      notes?: string;
    }) => {
      const { quote, shippingAddress, notes } = params;

      if (quote.paymentsFrozen) {
        throw new Error('DHB transfers are paused right now, so this purchase would fail. Try again once trading resumes.');
      }

      const { sendERC20Token } = await import('@/lib/wallet/send');
      const result = await sendERC20Token(
        quote.tokenAddress,
        quote.sellerAddress,
        String(quote.dhbAmount),
        18,
        quote.chainId as ChainId,
      );
      if (!result?.hash) throw new Error('Transaction was not submitted');

      // The receipt can lag the wallet's response, so a 202 means "ask again"
      // rather than "failed". The payment is already on-chain at this point —
      // giving up here would strand a real transfer with no order behind it.
      let lastError = 'Could not confirm the payment';
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          return await callFn<{ success: boolean; order: unknown; warning?: string }>(
            'live-checkout',
            {
              action: 'confirm',
              tokenId,
              listingId: quote.listingId,
              txHash: result.hash,
              shippingAddress,
              notes,
            },
            walletAddress,
          );
        } catch (err) {
          lastError = (err as Error).message;
          if (!/not found yet/i.test(lastError)) throw err;
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      logger.error('confirm timed out', { hash: result.hash });
      throw new Error(
        `${lastError}. Your payment went through — send this transaction to the seller: ${result.hash}`,
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stream-products', tokenId] });
      queryClient.invalidateQueries({ queryKey: ['store-orders'] });
      // Stock now comes off in the same server call that writes the order, so
      // the grid and the open listing are both stale the moment one lands.
      queryClient.invalidateQueries({ queryKey: ['store-listings-browse'] });
      queryClient.invalidateQueries({ queryKey: ['store-listings'] });
      queryClient.invalidateQueries({ queryKey: ['store-listing'] });
      if (data.warning) toast.warning(data.warning);
      else toast.success('Order placed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { getQuote, buy };
}

/**
 * The card rail, alongside `useProductCheckout`'s DHB one.
 *
 * Separate hook, separate edge function: the two rails answer different
 * questions ("is this transfer on Base?" vs "did Stripe capture?") and have to
 * keep working while the other is edited. What they share is the rule that
 * matters — the server prices the sale and the server writes the order.
 *
 * There is no `confirm` here on purpose. A card payment becomes real when
 * Stripe's webhook says so, not when the buyer's browser comes back; letting
 * the return page settle an order would put two settlement paths on one
 * PaymentIntent. The page polls `status` and waits.
 */
export function useCardCheckout(tokenId: string | null) {
  const { walletAddress } = useAuth();

  const getCardQuote = useMutation({
    mutationFn: (listingId: string) =>
      callFn<CardQuote>('store-checkout', { action: 'quote', tokenId, listingId }, walletAddress),
  });

  const payByCard = useMutation({
    mutationFn: (params: { listingId: string; shippingAddress: string; notes?: string }) =>
      callFn<{ checkoutUrl: string; sessionId: string }>(
        'store-checkout',
        {
          action: 'create_session',
          tokenId,
          listingId: params.listingId,
          shippingAddress: params.shippingAddress,
          notes: params.notes,
        },
        walletAddress,
      ),
    onSuccess: (data) => {
      // Full navigation, not window.open: a popup blocker or an in-app browser
      // silently swallows the second, and this is the step that takes payment.
      window.location.assign(data.checkoutUrl);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkStatus = useMutation({
    mutationFn: (sessionId: string) =>
      callFn<{
        status: 'created' | 'settled' | 'expired' | 'failed';
        orderId: string | null;
        warning: string | null;
        amountUsd: number;
      }>('store-checkout', { action: 'status', sessionId }, walletAddress),
  });

  return { getCardQuote, payByCard, checkStatus };
}
