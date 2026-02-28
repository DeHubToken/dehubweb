/**
 * Governance Comments Hook
 * ========================
 * Fetching and submitting comments on governance proposals.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface GovernanceComment {
  id: string;
  proposal_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
}

export function useGovernanceComments(proposalId: string | null) {
  return useQuery({
    queryKey: ['governance-comments', proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from('governance_comments')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as GovernanceComment[];
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });
}

export function useSubmitGovernanceComment() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({ proposalId, content }: { proposalId: string; content: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('governance_comments')
        .insert({
          proposal_id: proposalId,
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
      queryClient.invalidateQueries({ queryKey: ['governance-comments', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
    },
    onError: () => {
      toast.error('Failed to post comment');
    },
  });
}

export function useDeleteGovernanceComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, proposalId }: { commentId: string; proposalId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('governance_comments')
        .delete()
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
      return { proposalId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['governance-comments', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}
