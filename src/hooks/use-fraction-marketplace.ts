/**
 * Fraction Marketplace
 * ====================
 * Reads for the fraction market: listings (one post's book, and the whole
 * market), offers, trades, and the open obligations on both sides of a swap.
 *
 * Writes that decide money are NOT here — they live in `use-fraction-checkout`
 * against the `fraction-checkout` edge function, because every one of them has
 * to be verified against the chain before a row exists. What is left here is
 * reads plus the two withdrawals a party may always make of their own accord:
 * cancelling your own listing and withdrawing your own offer.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useEffect } from 'react';

/** Fractions minted per upload. Every token id is 1000 units, always. */
export const TOTAL_FRACTIONS = 1000;

export interface FractionListing {
  id: string;
  token_id: string;
  chain_id: number;
  seller_address: string;
  quantity: number;
  filled_quantity: number;
  price_per_fraction: number;
  status: string;
  created_at: string;
  updated_at: string;
  /** Display snapshot taken when the listing was created — never authoritative. */
  post_title: string | null;
  post_image_url: string | null;
  post_type: string | null;
  creator_address: string | null;
  creator_username: string | null;
}

export interface FractionOffer {
  id: string;
  token_id: string;
  chain_id: number;
  buyer_address: string;
  quantity: number;
  price_per_fraction: number;
  status: string;
  target_seller: string | null;
  listing_id: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type TradeStatus = 'awaiting_delivery' | 'awaiting_payment' | 'settled' | 'overdue';

export interface FractionTrade {
  id: string;
  token_id: string;
  chain_id: number;
  seller_address: string;
  buyer_address: string;
  quantity: number;
  price_per_fraction: number;
  total_dhb: number;
  tx_hash: string | null;
  delivery_tx_hash: string | null;
  listing_id: string | null;
  offer_id: string | null;
  status: TradeStatus;
  paid_at: string | null;
  delivered_at: string | null;
  settled_at: string | null;
  settle_by: string | null;
  created_at: string;
}

export interface FractionSellerStats {
  seller_address: string;
  total_trades: number;
  settled_trades: number;
  overdue_trades: number;
  open_trades: number;
  fractions_sold: number;
  avg_settle_seconds: number | null;
}

export type MarketSort = 'newest' | 'price_asc' | 'price_desc' | 'quantity_desc';

export const fractionKeys = {
  listings: (tokenId: string) => ['fraction-listings', tokenId] as const,
  offers: (tokenId: string) => ['fraction-offers', tokenId] as const,
  trades: (tokenId: string) => ['fraction-trades', tokenId] as const,
  market: (sort: string, search: string) => ['fraction-market', sort, search] as const,
  myListings: (address: string) => ['fraction-my-listings', address] as const,
  myOffers: (address: string) => ['fraction-my-offers', address] as const,
  openTrades: (address: string) => ['fraction-open-trades', address] as const,
  history: (address: string) => ['fraction-history', address] as const,
  sellerStats: (address: string) => ['fraction-seller-stats', address] as const,
  recentTrades: () => ['fraction-recent-trades'] as const,
};

/** Every query that a completed trade or a new listing can invalidate. */
export function invalidateFractionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  tokenId?: string,
) {
  if (tokenId) {
    queryClient.invalidateQueries({ queryKey: fractionKeys.listings(tokenId) });
    queryClient.invalidateQueries({ queryKey: fractionKeys.offers(tokenId) });
    queryClient.invalidateQueries({ queryKey: fractionKeys.trades(tokenId) });
  }
  queryClient.invalidateQueries({ queryKey: ['fraction-market'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-my-listings'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-my-offers'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-open-trades'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-history'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-recent-trades'] });
  queryClient.invalidateQueries({ queryKey: ['fraction-balance'] });
}

/** Subscribe a query key to postgres changes on one table, optionally filtered. */
function useRealtimeInvalidate(
  channel: string,
  table: string,
  filter: string | undefined,
  queryKey: readonly unknown[],
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const sub = supabase
      .channel(channel)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
    // queryKey is a stable tuple from fractionKeys; serialising it keeps the
    // effect from resubscribing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, filter, enabled, queryClient, JSON.stringify(queryKey)]);
}

// ── One post's book ─────────────────────────────────────────────────────────

export function useFractionListings(tokenId: string | undefined) {
  const query = useQuery({
    queryKey: fractionKeys.listings(tokenId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_listings')
        .select('*')
        .eq('token_id', tokenId!)
        .eq('status', 'active')
        .order('price_per_fraction', { ascending: true });
      if (error) throw error;
      return (data || []) as FractionListing[];
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });

  useRealtimeInvalidate(
    `fraction-listings-${tokenId}`,
    'fraction_listings',
    `token_id=eq.${tokenId}`,
    fractionKeys.listings(tokenId || ''),
    !!tokenId,
  );

  return query;
}

export function useFractionOffers(tokenId: string | undefined) {
  const query = useQuery({
    queryKey: fractionKeys.offers(tokenId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_offers')
        .select('*')
        .eq('token_id', tokenId!)
        .eq('status', 'pending')
        .order('price_per_fraction', { ascending: false });
      if (error) throw error;
      return (data || []) as FractionOffer[];
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });

  useRealtimeInvalidate(
    `fraction-offers-${tokenId}`,
    'fraction_offers',
    `token_id=eq.${tokenId}`,
    fractionKeys.offers(tokenId || ''),
    !!tokenId,
  );

  return query;
}

export function useFractionTrades(tokenId: string | undefined) {
  return useQuery({
    queryKey: fractionKeys.trades(tokenId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_trades')
        .select('*')
        .eq('token_id', tokenId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as FractionTrade[];
    },
    enabled: !!tokenId,
    staleTime: 60_000,
  });
}

// ── The whole market ────────────────────────────────────────────────────────

/**
 * Every open listing across every post.
 *
 * One Supabase query, no /api/feed round trip per card — that is what the
 * post_* snapshot columns on the listing are for. `search` matches the post
 * title, the creator's username, or a bare token id, because "post 5204" is
 * how people refer to these.
 */
export function useMarketListings(sort: MarketSort = 'newest', search = '') {
  const query = useQuery({
    queryKey: fractionKeys.market(sort, search),
    queryFn: async () => {
      let q = supabase.from('fraction_listings').select('*').eq('status', 'active');

      const term = search.trim();
      if (term) {
        const digits = term.replace(/^#/, '');
        const clauses = [
          `post_title.ilike.%${term}%`,
          `creator_username.ilike.%${term}%`,
        ];
        if (/^\d+$/.test(digits)) clauses.push(`token_id.eq.${digits}`);
        q = q.or(clauses.join(','));
      }

      if (sort === 'price_asc') q = q.order('price_per_fraction', { ascending: true });
      else if (sort === 'price_desc') q = q.order('price_per_fraction', { ascending: false });
      else if (sort === 'quantity_desc') q = q.order('quantity', { ascending: false });
      else q = q.order('created_at', { ascending: false });

      const { data, error } = await q.limit(60);
      if (error) throw error;
      // A listing whose whole quantity is reserved is still `active` until the
      // reservation lands, so drop it here rather than showing a card that
      // quotes "0 available".
      return ((data || []) as FractionListing[]).filter(
        l => l.quantity - l.filled_quantity > 0,
      );
    },
    // Sort/search changes keep the previous grid visible instead of flashing
    // skeletons, matching the stores browse grid.
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  useRealtimeInvalidate(
    'fraction-market',
    'fraction_listings',
    undefined,
    ['fraction-market'],
    true,
  );

  return query;
}

/** The market ticker: what actually traded, newest first. */
export function useRecentTrades(limit = 30) {
  return useQuery({
    queryKey: fractionKeys.recentTrades(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as FractionTrade[];
    },
    staleTime: 30_000,
  });
}

// ── Your side of it ─────────────────────────────────────────────────────────

export function useMyListings(address: string | null | undefined) {
  const key = (address || '').toLowerCase();
  return useQuery({
    queryKey: fractionKeys.myListings(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_listings')
        .select('*')
        .ilike('seller_address', key)
        .in('status', ['active', 'sold'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as FractionListing[];
    },
    enabled: !!key,
    staleTime: 20_000,
  });
}

export function useMyOffers(address: string | null | undefined) {
  const key = (address || '').toLowerCase();
  return useQuery({
    queryKey: fractionKeys.myOffers(key),
    queryFn: async () => {
      const [made, received] = await Promise.all([
        supabase
          .from('fraction_offers')
          .select('*')
          .ilike('buyer_address', key)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('fraction_offers')
          .select('*')
          .ilike('target_seller', key)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);
      if (made.error) throw made.error;
      if (received.error) throw received.error;
      return {
        made: (made.data || []) as FractionOffer[],
        received: (received.data || []) as FractionOffer[],
      };
    },
    enabled: !!key,
    staleTime: 20_000,
  });
}

/**
 * Swaps with a leg still outstanding, on either side.
 *
 * This is the query the settlement rail runs, and it is the reason the market
 * can work without an escrow contract: an open trade here is one whose FIRST
 * leg is already verified on-chain, so it is a real obligation with a named
 * counterparty and a deadline, not a claim.
 */
export function useOpenTrades(address: string | null | undefined) {
  const key = (address || '').toLowerCase();
  const query = useQuery({
    queryKey: fractionKeys.openTrades(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_trades')
        .select('*')
        .or(`seller_address.ilike.${key},buyer_address.ilike.${key}`)
        .in('status', ['awaiting_delivery', 'awaiting_payment'])
        .order('settle_by', { ascending: true });
      if (error) throw error;

      const trades = (data || []) as FractionTrade[];
      return {
        /** You owe the fractions — a buyer has already paid for them. */
        toDeliver: trades.filter(
          t => t.status === 'awaiting_delivery' && t.seller_address.toLowerCase() === key,
        ),
        /** You owe the DHB — the fractions are already in your wallet. */
        toPay: trades.filter(
          t => t.status === 'awaiting_payment' && t.buyer_address.toLowerCase() === key,
        ),
        /** Waiting on the other side. */
        waiting: trades.filter(t =>
          (t.status === 'awaiting_delivery' && t.buyer_address.toLowerCase() === key) ||
          (t.status === 'awaiting_payment' && t.seller_address.toLowerCase() === key),
        ),
        all: trades,
      };
    },
    enabled: !!key,
    staleTime: 15_000,
  });

  useRealtimeInvalidate(
    `fraction-open-trades-${key}`,
    'fraction_trades',
    undefined,
    fractionKeys.openTrades(key),
    !!key,
  );

  return query;
}

/** Settled trades on either side, newest first. */
export function useTradeHistory(address: string | null | undefined) {
  const key = (address || '').toLowerCase();
  return useQuery({
    queryKey: fractionKeys.history(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_trades')
        .select('*')
        .or(`seller_address.ilike.${key},buyer_address.ilike.${key}`)
        .eq('status', 'settled')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as FractionTrade[];
    },
    enabled: !!key,
    staleTime: 60_000,
  });
}

/**
 * A seller's delivery record.
 *
 * With no escrow contract, this is the only thing a buyer can price the
 * counterparty risk on, which is why it sits on the listing card rather than
 * somewhere you have to go looking for it.
 */
export function useSellerStats(address: string | null | undefined) {
  const key = (address || '').toLowerCase();
  return useQuery({
    queryKey: fractionKeys.sellerStats(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_seller_stats')
        .select('*')
        .eq('seller_address', key)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as FractionSellerStats | null;
    },
    enabled: !!key,
    staleTime: 5 * 60_000,
  });
}

/** Stats for a page's worth of sellers in one query, keyed by address. */
export function useSellerStatsBatch(addresses: string[]) {
  const keys = Array.from(new Set(addresses.map(a => a.toLowerCase()))).sort();
  return useQuery({
    queryKey: ['fraction-seller-stats-batch', keys.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_seller_stats')
        .select('*')
        .in('seller_address', keys);
      if (error) throw error;
      const map: Record<string, FractionSellerStats> = {};
      for (const row of (data || []) as FractionSellerStats[]) {
        map[row.seller_address] = row;
      }
      return map;
    },
    enabled: keys.length > 0,
    staleTime: 5 * 60_000,
  });
}

// ── Withdrawals ─────────────────────────────────────────────────────────────
// The only two writes a party may make unilaterally. Both are RLS-gated to the
// row's own address; everything else that moves value goes through the edge
// function so it can be checked against the chain first.

export function useCancelListing() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: { listingId: string; tokenId: string }) => {
      const query = supabase
        .from('fraction_listings')
        .update({ status: 'cancelled' })
        .eq('id', params.listingId);
      const { error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => invalidateFractionQueries(queryClient, params.tokenId),
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      tokenId: string;
      quantity: number;
      pricePerFraction: number;
      targetSeller?: string;
      listingId?: string;
      chainId?: number;
    }) => {
      const query = supabase
        .from('fraction_offers')
        .insert({
          token_id: params.tokenId,
          chain_id: params.chainId || 8453,
          buyer_address: walletAddress!.toLowerCase(),
          quantity: params.quantity,
          price_per_fraction: params.pricePerFraction,
          target_seller: params.targetSeller?.toLowerCase() || null,
          listing_id: params.listingId || null,
        })
        .select()
        .single();
      const { data, error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return data as FractionOffer;
    },
    onSuccess: (data) => invalidateFractionQueries(queryClient, data.token_id),
  });
}

export function useCancelOffer() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: { offerId: string; tokenId: string }) => {
      const query = supabase
        .from('fraction_offers')
        .update({ status: 'cancelled' })
        .eq('id', params.offerId);
      const { error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => invalidateFractionQueries(queryClient, params.tokenId),
  });
}
