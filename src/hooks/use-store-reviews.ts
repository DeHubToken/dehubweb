/**
 * Store Reviews Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useListingReviews(listingId: string | undefined) {
  return useQuery({
    queryKey: ['store-reviews', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_reviews')
        .select('*')
        .eq('listing_id', listingId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!listingId,
  });
}

export function useHasPurchased(listingId: string | undefined) {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['has-purchased', listingId, walletAddress],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('store_orders')
          .select('id')
          .eq('listing_id', listingId!)
          .eq('buyer_address', walletAddress!.toLowerCase())
          .limit(1),
        walletAddress!
      );
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!listingId && !!walletAddress,
  });
}

export function useCreateReview() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { listing_id: string; rating: number; comment?: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await withWalletHeader(
        supabase.from('store_reviews').insert({
          listing_id: params.listing_id,
          reviewer_address: walletAddress.toLowerCase(),
          rating: params.rating,
          comment: params.comment || '',
        } as any).select().single(),
        walletAddress
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['store-reviews', vars.listing_id] });
      toast.success('Review submitted!');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit review'),
  });
}

export function useListingAvgRating(listingId: string | undefined) {
  const { data: reviews } = useListingReviews(listingId);
  if (!reviews || reviews.length === 0) return { avg: 0, count: 0 };
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return { avg, count: reviews.length };
}
