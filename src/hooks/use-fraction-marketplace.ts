/**
 * Fraction Marketplace Hooks
 * ==========================
 * Queries and mutations for fraction listings, offers, and trades.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useEffect } from 'react';

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
  created_at: string;
}

const fractionKeys = {
  listings: (tokenId: string) => ['fraction-listings', tokenId] as const,
  offers: (tokenId: string) => ['fraction-offers', tokenId] as const,
  trades: (tokenId: string) => ['fraction-trades', tokenId] as const,
};

export function useFractionListings(tokenId: string | undefined) {
  const queryClient = useQueryClient();

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

  // Realtime subscription
  useEffect(() => {
    if (!tokenId) return;
    const channel = supabase
      .channel(`fraction-listings-${tokenId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fraction_listings',
        filter: `token_id=eq.${tokenId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: fractionKeys.listings(tokenId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId, queryClient]);

  return query;
}

export function useFractionOffers(tokenId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: fractionKeys.offers(tokenId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraction_offers')
        .select('*')
        .eq('token_id', tokenId!)
        .in('status', ['pending'])
        .order('price_per_fraction', { ascending: false });
      if (error) throw error;
      return (data || []) as FractionOffer[];
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tokenId) return;
    const channel = supabase
      .channel(`fraction-offers-${tokenId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fraction_offers',
        filter: `token_id=eq.${tokenId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: fractionKeys.offers(tokenId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId, queryClient]);

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

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: { tokenId: string; quantity: number; pricePerFraction: number; chainId?: number }) => {
      const query = supabase
        .from('fraction_listings')
        .insert({
          token_id: params.tokenId,
          chain_id: params.chainId || 8453,
          seller_address: walletAddress!.toLowerCase(),
          quantity: params.quantity,
          price_per_fraction: params.pricePerFraction,
        })
        .select()
        .single();
      const { data, error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return data as FractionListing;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.listings(data.token_id) });
    },
  });
}

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
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.listings(params.tokenId) });
    },
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.offers(data.token_id) });
    },
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
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.offers(params.tokenId) });
    },
  });
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: { offerId: string; tokenId: string; txHash?: string }) => {
      const query = supabase
        .from('fraction_offers')
        .update({ status: 'accepted', tx_hash: params.txHash || null })
        .eq('id', params.offerId);
      const { error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.offers(params.tokenId) });
      queryClient.invalidateQueries({ queryKey: fractionKeys.trades(params.tokenId) });
    },
  });
}

export function useRejectOffer() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: { offerId: string; tokenId: string }) => {
      const query = supabase
        .from('fraction_offers')
        .update({ status: 'rejected' })
        .eq('id', params.offerId);
      const { error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.offers(params.tokenId) });
    },
  });
}

export function useRecordTrade() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      tokenId: string;
      sellerAddress: string;
      buyerAddress: string;
      quantity: number;
      pricePerFraction: number;
      txHash?: string;
      listingId?: string;
      offerId?: string;
      chainId?: number;
    }) => {
      const query = supabase
        .from('fraction_trades')
        .insert({
          token_id: params.tokenId,
          chain_id: params.chainId || 8453,
          seller_address: params.sellerAddress.toLowerCase(),
          buyer_address: params.buyerAddress.toLowerCase(),
          quantity: params.quantity,
          price_per_fraction: params.pricePerFraction,
          total_dhb: params.quantity * params.pricePerFraction,
          tx_hash: params.txHash || null,
          listing_id: params.listingId || null,
          offer_id: params.offerId || null,
        })
        .select()
        .single();
      const { data, error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
      return data as FractionTrade;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: fractionKeys.trades(data.token_id) });
      queryClient.invalidateQueries({ queryKey: fractionKeys.listings(data.token_id) });
    },
  });
}
