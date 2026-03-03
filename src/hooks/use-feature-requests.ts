/**
 * Feature Requests Hook
 * =====================
 * Data fetching and mutations for the feature request board.
 * Uses Supabase directly for CRUD operations with optimistic updates.
 * Aggressively cached in sessionStorage for instant page loads.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  like_count: number;
  dislike_count: number;
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

// Session-level cache for instant page loads
const CACHE_KEY = 'feature-requests-cache';
const SHIPPED_CACHE_KEY = 'feature-requests-shipped-cache';

function getSessionCache<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const { data, ts } = JSON.parse(raw);
    // Cache valid for 5 minutes
    if (Date.now() - ts > 5 * 60 * 1000) return undefined;
    return data as T;
  } catch { return undefined; }
}

function setSessionCache(key: string, data: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

const PAGE_SIZE = 15;

export function useFeatureRequests(sort: FeatureSort, category: FeatureCategory | 'all', search: string) {
  return useInfiniteQuery({
    queryKey: ['feature-requests', sort, category, search],
    queryFn: async ({ pageParam = 0 }) => {
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

      // Pagination
      query = query.range(pageParam, pageParam + PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FeatureRequest[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useTotalFeatureCount() {
  return useQuery({
    queryKey: ['feature-requests-total-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('feature_requests')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
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
      const result = (data || []) as FeatureRequest[];
      setSessionCache(SHIPPED_CACHE_KEY, result);
      return result;
    },
    initialData: () => getSessionCache<FeatureRequest[]>(SHIPPED_CACHE_KEY),
    initialDataUpdatedAt: () => {
      try {
        const raw = sessionStorage.getItem(SHIPPED_CACHE_KEY);
        if (raw) return JSON.parse(raw).ts;
      } catch {}
      return undefined;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
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
    staleTime: 60_000,
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
        .single()
        .setHeader('x-wallet-address', walletAddress.toLowerCase());

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
          .eq('wallet_address', wallet)
          .setHeader('x-wallet-address', wallet);

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
          )
          .setHeader('x-wallet-address', wallet);

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

      // Optimistically update vote count on feature requests (InfiniteData shape)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: FeatureRequest[]) =>
            page.map((fr) => {
              if (fr.id !== featureRequestId) return fr;
              let delta: number = voteType;
              if (currentVote === voteType) {
                delta = -voteType;
              } else if (currentVote) {
                delta = voteType - currentVote;
              }
              return { ...fr, vote_count: fr.vote_count + delta };
            })
          ),
        };
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
      // Only refresh votes, not the full list — avoids reordering cards mid-session
      queryClient.invalidateQueries({ queryKey: ['feature-request-votes'] });
    },
  });
}
