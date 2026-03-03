/**
 * Feature Request Comments Hook
 * ==============================
 * Fetching and submitting comments on feature requests.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface FeatureRequestComment {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
}

export function useFeatureRequestComments(featureRequestId: string | null) {
  return useQuery({
    queryKey: ['feature-request-comments', featureRequestId],
    queryFn: async () => {
      if (!featureRequestId) return [];
      const { data, error } = await supabase
        .from('feature_request_comments')
        .select('*')
        .eq('feature_request_id', featureRequestId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as FeatureRequestComment[];
    },
    enabled: !!featureRequestId,
    staleTime: 30_000,
  });
}

export function useSubmitComment() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({ featureRequestId, content }: { featureRequestId: string; content: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('feature_request_comments')
        .insert({
          feature_request_id: featureRequestId,
          wallet_address: walletAddress.toLowerCase(),
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
          content: content.trim(),
        })
        .select()
        .single()
        .setHeader('x-wallet-address', walletAddress.toLowerCase());

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
      // Optimistically bump comment count without refetching the list (avoids reordering)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((fr) => fr.id === variables.featureRequestId ? { ...fr, comment_count: (fr.comment_count || 0) + 1 } : fr)
          ),
        };
      });
    },
    onError: () => {
      toast.error('Failed to post comment');
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, featureRequestId }: { commentId: string; featureRequestId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('feature_request_comments')
        .delete()
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());

      if (error) throw error;
      return { featureRequestId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
      // Optimistically decrement comment count without refetching the list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((fr) => fr.id === variables.featureRequestId ? { ...fr, comment_count: Math.max(0, (fr.comment_count || 0) - 1) } : fr)
          ),
        };
      });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}
