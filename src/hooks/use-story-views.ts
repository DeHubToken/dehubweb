/**
 * Story Views Hook
 * ================
 * Tracks and fetches view counts for stories via edge function.
 * Returns null while loading to prevent flashing 0.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useRef, useEffect } from 'react';

const STORIES_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stories-api`;

// Cache view counts in memory to prevent flashing on re-renders
const viewCountCache = new Map<string, number>();

export function useStoryViews(storyId: string | undefined) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const recordedViews = useRef<Set<string>>(new Set());

  // Fetch view count for this story via edge function
  const { data: fetchedCount, isLoading, isFetched } = useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async (): Promise<number> => {
      if (!storyId) return 0;

      const response = await fetch(`${STORIES_API_URL}/views?story_id=${storyId}`);
      if (!response.ok) {
        console.error('[story-views] Error fetching view count');
        return viewCountCache.get(storyId) ?? 0;
      }

      const data = await response.json();
      const count = data.result?.count ?? 0;
      
      // Cache the result
      viewCountCache.set(storyId, count);
      return count;
    },
    enabled: !!storyId,
    staleTime: 60000, // Keep data fresh for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  // Use cached value if available, otherwise use fetched value
  const viewCount = storyId 
    ? (fetchedCount ?? viewCountCache.get(storyId) ?? null)
    : 0;

  // Update cache when fetch completes
  useEffect(() => {
    if (storyId && fetchedCount !== undefined) {
      viewCountCache.set(storyId, fetchedCount);
    }
  }, [storyId, fetchedCount]);

  // Mutation to record a view via edge function (no auth required)
  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!storyId) {
        throw new Error('Missing story ID');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Include wallet address if logged in
      if (walletAddress) {
        headers['x-wallet-address'] = walletAddress.toLowerCase();
      }

      const response = await fetch(`${STORIES_API_URL}/views`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ story_id: storyId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to record view');
      }

      return response.json();
    },
    onSuccess: () => {
      // Optimistically increment the cached count
      if (storyId) {
        const currentCount = viewCountCache.get(storyId) ?? 0;
        const newCount = currentCount + 7; // Apply 7x multiplier locally too
        viewCountCache.set(storyId, newCount);
        queryClient.setQueryData(['story-views', storyId], newCount);
      }
    },
    onError: (err) => {
      console.error('[story-views] Error recording view:', err);
    },
  });

  // Record view when story is viewed - tracks per session to avoid duplicates
  // No login required - anyone can view
  const recordView = () => {
    if (storyId && !recordedViews.current.has(storyId)) {
      recordedViews.current.add(storyId);
      recordViewMutation.mutate();
    }
  };

  return {
    viewCount: viewCount ?? 0, // Return 0 as fallback, but cache prevents flash
    isLoading: isLoading && viewCount === null,
    recordView,
  };
}
