/**
 * Story Views Hook
 * ================
 * Tracks and fetches view counts for stories via edge function.
 * Uses keepPreviousData to prevent flashing to 0 during navigation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRef } from 'react';

const STORIES_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stories-api`;

export function useStoryViews(storyId: string | undefined) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const recordedViews = useRef<Set<string>>(new Set());

  // Fetch view count for this story via edge function
  const { data: viewCount = 0, isLoading } = useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async (): Promise<number> => {
      if (!storyId) return 0;

      const response = await fetch(`${STORIES_API_URL}/views?story_id=${storyId}`);
      if (!response.ok) {
        console.error('[story-views] Error fetching view count');
        return 0;
      }

      const data = await response.json();
      return data.result?.count ?? 0;
    },
    enabled: !!storyId,
    staleTime: 30000,
    placeholderData: (previousData) => previousData ?? 0, // Keep previous data to prevent flash
  });

  // Mutation to record a view via edge function
  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!storyId || !walletAddress) {
        throw new Error('Missing story ID or wallet address');
      }

      const lowerWallet = walletAddress.toLowerCase();

      const response = await fetch(`${STORIES_API_URL}/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': lowerWallet,
        },
        body: JSON.stringify({ story_id: storyId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to record view');
      }

      return response.json();
    },
    onSuccess: () => {
      // Optimistically increment the cached count instead of refetching
      queryClient.setQueryData(['story-views', storyId], (old: number | undefined) => (old ?? 0) + 1);
    },
    onError: (err) => {
      console.error('[story-views] Error recording view:', err);
    },
  });

  // Record view when story is viewed - tracks per session to avoid duplicates
  const recordView = () => {
    if (storyId && walletAddress && !recordedViews.current.has(storyId)) {
      recordedViews.current.add(storyId);
      recordViewMutation.mutate();
    }
  };

  return {
    viewCount,
    isLoading,
    recordView,
  };
}
