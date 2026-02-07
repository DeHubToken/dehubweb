/**
 * Feature Requests Hook
 * =====================
 * Data fetching and mutations for the feature request board.
 * Uses Supabase directly for CRUD operations with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type FeatureCategory = 'ui_ux' | 'performance' | 'new_feature' | 'bug_fix' | 'integration' | 'other';
export type FeatureStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
export type FeatureSort = 'most_voted' | 'newest';

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  category: FeatureCategory;
  status: FeatureStatus;
  author_wallet_address: string;
  author_username: string | null;
  author_avatar: string | null;
  vote_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface FeatureRequestVote {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  vote_type: number;
}

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ui_ux: 'UI/UX',
  performance: 'Performance',
  new_feature: 'New Feature',
  bug_fix: 'Bug Fix',
  integration: 'Integration',
  other: 'Other',
};

const STATUS_LABELS: Record<FeatureStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  declined: 'Declined',
};

export { CATEGORY_LABELS, STATUS_LABELS };

export function useFeatureRequests(sort: FeatureSort, category: FeatureCategory | 'all', search: string) {
  return useQuery({
    queryKey: ['feature-requests', sort, category, search],
    queryFn: async () => {
      let query = supabase
        .from('feature_requests')
        .select('*');

      if (category !== 'all') {
        query = query.eq('category', category);
      }

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
      }

      switch (sort) {
        case 'most_voted':
          query = query.order('vote_count', { ascending: false }).order('created_at', { ascending: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
      }

      // Exclude shipped (completed) features from the main list
      query = query.neq('status', 'completed');

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    staleTime: 30_000,
  });
}

export function useShippedFeatures() {
  return useQuery({
    queryKey: ['feature-requests-shipped'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_requests')
        .select('*')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    staleTime: 30_000,
  });
}

export function useUserVotes() {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['feature-request-votes', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return {};
      const { data, error } = await supabase
        .from('feature_request_votes')
        .select('feature_request_id, vote_type')
        .eq('wallet_address', walletAddress.toLowerCase());

      if (error) throw error;

      const voteMap: Record<string, number> = {};
      for (const vote of data || []) {
        voteMap[vote.feature_request_id] = vote.vote_type;
      }
      return voteMap;
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

export function useSubmitFeatureRequest() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({ title, description, category }: { title: string; description: string; category: FeatureCategory }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('feature_requests')
        .insert({
          title: title.trim(),
          description: description.trim(),
          category,
          author_wallet_address: walletAddress.toLowerCase(),
          author_username: user?.username || null,
          author_avatar: user?.avatarImageUrl || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast.success('Feature request submitted!');
    },
    onError: (error) => {
      console.error('Submit feature request failed:', error);
      toast.error('Failed to submit feature request');
    },
  });
}

export function useVoteFeatureRequest() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ featureRequestId, voteType, currentVote }: { featureRequestId: string; voteType: 1 | -1; currentVote: number | undefined }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const wallet = walletAddress.toLowerCase();

      if (currentVote === voteType) {
        // Remove vote (toggle off)
        const { error } = await supabase
          .from('feature_request_votes')
          .delete()
          .eq('feature_request_id', featureRequestId)
          .eq('wallet_address', wallet);

        if (error) throw error;
        return { action: 'removed' as const };
      } else {
        // Upsert vote
        const { error } = await supabase
          .from('feature_request_votes')
          .upsert(
            {
              feature_request_id: featureRequestId,
              wallet_address: wallet,
              vote_type: voteType,
            },
            { onConflict: 'feature_request_id,wallet_address' }
          );

        if (error) throw error;
        return { action: 'voted' as const };
      }
    },
    onMutate: async ({ featureRequestId, voteType, currentVote }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: ['feature-requests'] });
      await queryClient.cancelQueries({ queryKey: ['feature-request-votes'] });

      // Snapshot previous state
      const previousRequests = queryClient.getQueriesData({ queryKey: ['feature-requests'] });
      const previousVotes = queryClient.getQueryData(['feature-request-votes', walletAddress]);

      // Optimistically update votes map
      queryClient.setQueryData(['feature-request-votes', walletAddress], (old: Record<string, number> | undefined) => {
        const newVotes = { ...(old || {}) };
        if (currentVote === voteType) {
          delete newVotes[featureRequestId];
        } else {
          newVotes[featureRequestId] = voteType;
        }
        return newVotes;
      });

      // Optimistically update vote count on feature requests
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: FeatureRequest[] | undefined) => {
        if (!old) return old;
        return old.map((fr) => {
          if (fr.id !== featureRequestId) return fr;
          let delta: number = voteType;
          if (currentVote === voteType) {
            delta = -voteType; // removing the vote
          } else if (currentVote) {
            delta = voteType - currentVote; // switching from -1 to +1 = +2
          }
          return { ...fr, vote_count: fr.vote_count + delta };
        });
      });

      return { previousRequests, previousVotes };
    },
    onError: (_err, _vars, context) => {
      // Rollback
      if (context?.previousRequests) {
        for (const [key, data] of context.previousRequests) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousVotes) {
        queryClient.setQueryData(['feature-request-votes', walletAddress], context.previousVotes);
      }
      toast.error('Vote failed. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['feature-request-votes'] });
    },
  });
}
