/**
 * Stores Hooks
 * =============
 * React Query hooks for stores, listings, and orders.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ── My Stores ──────────────────────────────────────────────
export function useMyStores() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['my-stores', walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('stores').select('*').eq('wallet_address', walletAddress!.toLowerCase()).order('created_at', { ascending: true }),
        walletAddress!
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!walletAddress,
  });
}

export function useCreateStore() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; description?: string; avatar_url?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from('stores').insert({
          wallet_address: walletAddress.toLowerCase(),
          name: params.name,
          description: params.description || '',
          avatar_url: params.avatar_url || null,
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-stores'] });
      toast.success('Store created!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ── Listings ──────────────────────────────────────────────
export function useBrowseListings(category?: string, sort?: string, search?: string) {
  return useQuery({
    queryKey: ['store-listings-browse', category, sort, search],
    queryFn: async () => {
      let q = supabase.from('store_listings').select('*, stores(name, avatar_url, wallet_address)').eq('status', 'active');
      if (category && category !== 'all') q = q.eq('category', category);
      if (search) q = q.ilike('title', `%${search}%`);
      if (sort === 'price_asc') q = q.order('price', { ascending: true });
      else if (sort === 'price_desc') q = q.order('price', { ascending: false });
      else q = q.order('created_at', { ascending: false });
      q = q.limit(50);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useStoreById(storeId: string | undefined) {
  return useQuery({
    queryKey: ['store', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export function useStoreListing(listingId: string | undefined) {
  return useQuery({
    queryKey: ['store-listing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_listings')
        .select('*, stores(name, avatar_url, wallet_address)')
        .eq('id', listingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!listingId,
  });
}

export function useStoreListings(storeId: string | undefined) {
  return useQuery({
    queryKey: ['store-listings', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_listings')
        .select('*, stores(name, avatar_url, wallet_address)')
        .eq('store_id', storeId!)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!storeId,
  });
}

export function useMyListings() {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['my-store-listings', walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('store_listings').select('*').eq('wallet_address', walletAddress!.toLowerCase()).order('created_at', { ascending: false }),
        walletAddress!
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!walletAddress,
  });
}

export function useCreateListing() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      title: string;
      description?: string;
      price: number;
      category: string;
      images: string[];
      stock_quantity?: number | null;
      is_digital: boolean;
      digital_file_url?: string;
      condition: string;
      shipping_info?: string;
      status?: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from('store_listings').insert({
          ...params,
          wallet_address: walletAddress.toLowerCase(),
          images: params.images,
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-store-listings'] });
      qc.invalidateQueries({ queryKey: ['store-listings-browse'] });
      toast.success('Listing created!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateListing() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from('store_listings').update(updates as any).eq('id', id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-store-listings'] });
      qc.invalidateQueries({ queryKey: ['store-listings-browse'] });
    },
  });
}

// ── Orders ──────────────────────────────────────────────
export function useMyOrders(type: 'buyer' | 'seller') {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['store-orders', type, walletAddress],
    queryFn: async () => {
      let q = supabase.from('store_orders').select('*, store_listings(title, images, price)');
      if (type === 'buyer') q = q.eq('buyer_address', walletAddress!.toLowerCase());
      else q = q.eq('seller_address', walletAddress!.toLowerCase());
      q = q.order('created_at', { ascending: false });
      const { data, error } = await withWalletHeader(q, walletAddress!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!walletAddress,
  });
}

export function useCreateOrder() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      listing_id: string;
      seller_address: string;
      amount: number;
      tx_hash: string;
      shipping_address?: string;
      notes?: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from('store_orders').insert({
          ...params,
          buyer_address: walletAddress.toLowerCase(),
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-orders'] });
      qc.invalidateQueries({ queryKey: ['store-listings-browse'] });
      toast.success('Order placed successfully!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOrderStatus() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from('store_orders').update({ status } as any).eq('id', id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-orders'] });
    },
  });
}

// ── Update Store ──────────────────────────────────────────
export function useUpdateStore() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; avatar_url?: string; banner_url?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await withWalletHeader(
        supabase.from('stores').update(updates as any).eq('id', id),
        walletAddress
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-stores'] });
      qc.invalidateQueries({ queryKey: ['store'] });
      toast.success('Store updated!');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export async function uploadStoreMedia(file: File, walletAddress: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${walletAddress.toLowerCase()}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('store-media').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('store-media').getPublicUrl(path);
  return data.publicUrl;
}
