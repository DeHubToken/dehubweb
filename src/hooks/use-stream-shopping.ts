/**
 * Live Shopping Hooks
 * ===================
 * The product rail attached to a live stream, and the checkout that runs
 * against it.
 *
 * Two rules hold this together, and both exist because of how the marketplace
 * path works today:
 *
 * - **The client never prices anything.** `live-checkout` quotes in DHB and
 *   verifies the transfer on Base before an order row exists. The USD figures
 *   here are for display; nothing derived in this file is ever signed. The
 *   store drawer divides in the browser and sends 0 DHB when the price feed
 *   returns 0 — this path cannot do that, because it never does the division.
 * - **The client never writes.** stream_products has no INSERT/UPDATE/DELETE
 *   policy; the edge function writes under the service role after checking the
 *   caller minted the stream. RLS here resolves the caller from an unsigned
 *   header, so a policy could not have told a creator from anyone else.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthToken } from '@/lib/api/dehub/core';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import type { ChainId } from '@/components/app/ChainSelector';

const logger = createLogger('StreamShopping');

export interface StreamProduct {
  id: string;
  token_id: string;
  listing_id: string;
  creator_address: string;
  position: number;
  is_pinned: boolean;
  pinned_at: string | null;
  live_price: number | null;
  store_listings: {
    id: string;
    title: string;
    description: string | null;
    price: number;
    images: string[] | null;
    category: string;
    is_digital: boolean;
    stock_quantity: number | null;
    status: string;
    wallet_address: string;
    shipping_info: string | null;
  } | null;
}

export interface LiveQuote {
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

async function callFn<T>(
  fn: 'stream-products' | 'live-checkout',
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

/** The effective price of an attached product: live override beats list price. */
export function effectivePrice(product: StreamProduct): number {
  return Number(product.live_price ?? product.store_listings?.price ?? 0);
}

/**
 * Products on a stream, live.
 *
 * Realtime carries the raw row, not the joined listing, so a change refetches
 * rather than patching the cache — the rail has at most 20 rows and a pin has
 * to be right more than it has to be instant.
 */
export function useStreamProducts(tokenId: string | null) {
  const queryClient = useQueryClient();
  // The pinned overlay and the rail both call this hook for the same stream.
  // Two channels created with the same topic name are not two subscriptions —
  // removing one on unmount tears the other's socket down with it, so the
  // surviving component silently stops receiving pins. A per-instance suffix
  // keeps them independent; React Query still dedupes the fetch itself.
  const channelId = useRef(Math.random().toString(36).slice(2));

  const query = useQuery({
    queryKey: ['stream-products', tokenId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stream_products')
        .select('*, store_listings(id, title, description, price, images, category, is_digital, stock_quantity, status, wallet_address, shipping_info)')
        .eq('token_id', tokenId!)
        .order('is_pinned', { ascending: false })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as StreamProduct[];
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!tokenId) return;
    const channel = supabase
      .channel(`stream-products-${tokenId}-${channelId.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stream_products', filter: `token_id=eq.${tokenId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['stream-products', tokenId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tokenId, queryClient]);

  const products = query.data || [];
  // Sold-out and de-listed items stay in the creator's manager but leave the
  // viewer's rail — a live rail that offers something unbuyable is worse than
  // a shorter one.
  const sellable = useMemo(
    () => products.filter(p => p.store_listings?.status === 'active' && p.store_listings?.stock_quantity !== 0),
    [products],
  );
  const pinned = useMemo(() => sellable.find(p => p.is_pinned) || null, [sellable]);

  return { products, sellable, pinned, isLoading: query.isLoading, refetch: query.refetch };
}

/** Creator-side rail management. Every call is ownership-checked server-side. */
export function useStreamProductActions(tokenId: string | null) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stream-products', tokenId] });

  const attach = useMutation({
    mutationFn: (params: { listingId: string; livePrice?: number | null }) =>
      callFn('stream-products', {
        action: 'attach',
        tokenId,
        listingId: params.listingId,
        livePrice: params.livePrice ?? null,
      }, walletAddress),
    onSuccess: () => { invalidate(); toast.success('Added to the stream'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const detach = useMutation({
    mutationFn: (listingId: string) =>
      callFn('stream-products', { action: 'detach', tokenId, listingId }, walletAddress),
    onSuccess: () => { invalidate(); toast.success('Removed from the stream'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pin = useMutation({
    mutationFn: (listingId: string) =>
      callFn('stream-products', { action: 'pin', tokenId, listingId }, walletAddress),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const unpin = useMutation({
    mutationFn: () => callFn('stream-products', { action: 'unpin', tokenId }, walletAddress),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return { attach, detach, pin, unpin };
}

/**
 * Buy a product from a stream.
 *
 * quote → pay → confirm. The wallet stack is imported at call time: this hook
 * is reachable from the eager live card, and scripts/check-entry-bundle.mjs
 * fails the build if wagmi lands in the entry chunk.
 */
export function useLiveCheckout(tokenId: string | null) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const getQuote = useMutation({
    mutationFn: (listingId: string) =>
      callFn<LiveQuote>('live-checkout', { action: 'quote', tokenId, listingId }, walletAddress),
  });

  const buy = useMutation({
    mutationFn: async (params: {
      quote: LiveQuote;
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
      if (data.warning) toast.warning(data.warning);
      else toast.success('Order placed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { getQuote, buy };
}

export interface StreamOrder {
  id: string;
  amount: number;
  buyer_address: string;
  created_at: string;
  status: string;
  paid_token_amount: number | null;
  store_listings: { title: string | null; images: string[] | null } | null;
}

/** Orders placed from a given stream — the creator's live sales feed. */
export function useStreamOrders(tokenId: string | null, enabled: boolean) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['stream-orders', tokenId, walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('store_orders')
          .select('*, store_listings(title, images)')
          .eq('stream_token_id', tokenId!)
          .order('created_at', { ascending: false })
          .limit(50),
        walletAddress!,
      );
      if (error) throw error;
      return (data || []) as unknown as StreamOrder[];
    },
    enabled: !!tokenId && !!walletAddress && enabled,
  });

  useEffect(() => {
    if (!tokenId || !enabled || !walletAddress) return;
    const channel = supabase
      .channel(`stream-orders-${tokenId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'store_orders', filter: `stream_token_id=eq.${tokenId}` },
        () => queryClient.invalidateQueries({ queryKey: ['stream-orders', tokenId, walletAddress] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId, enabled, walletAddress, queryClient]);

  return query;
}
