/**
 * Live Shopping Hooks
 * ===================
 * The product rail attached to a live stream, and the creator-side management
 * of it. Buying is in use-product-checkout, shared with the marketplace.
 *
 * The rule that holds this together: **the client never writes.**
 * stream_products has no INSERT/UPDATE/DELETE policy; the edge function writes
 * under the service role after checking the caller minted the stream. RLS here
 * resolves the caller from an unsigned header, so a policy could not have told
 * a creator from anyone else.
 *
 * The USD figures computed here are display only — the amount a buyer signs for
 * is quoted server-side, never derived in the browser.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { callFn } from '@/hooks/use-product-checkout';
import { toast } from 'sonner';

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

export interface StreamOrder {
  id: string;
  amount: number;
  buyer_address: string;
  created_at: string;
  status: string;
  paid_token_amount: number | null;
  /** 'DHB' on the crypto rail, 'USD' on the card rail. */
  paid_token_symbol: string | null;
  payment_method: string | null;
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
