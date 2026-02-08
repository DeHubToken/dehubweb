/**
 * Story Views Hook
 * ================
 * Tracks and fetches view counts for stories via edge function.
 * Every call to recordView() fires a POST — no dedup, no auth required.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const STORIES_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stories-api`;

// Cache view counts in memory to prevent flashing on re-renders
const viewCountCache = new Map<string, number>();

export function useStoryViews(storyId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch view count for this story via edge function
  const { data: fetchedCount, isLoading } = useQuery({
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
    staleTime: 30000,
    gcTime: 300000,
  });

  // Use cached value if available, otherwise use fetched value
  const viewCount = storyId
    ? (fetchedCount ?? viewCountCache.get(storyId) ?? null)
    : 0;

  // Mutation to record a view — every call = 1 new row, no dedup
  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!storyId) {
        throw new Error('Missing story ID');
      }

      const response = await fetch(`${STORIES_API_URL}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: storyId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to record view');
      }

      return response.json();
    },
    onSuccess: () => {
      if (storyId) {
        queryClient.invalidateQueries({ queryKey: ['story-views', storyId] });
      }
    },
    onError: (err) => {
      console.error('[story-views] Error recording view:', err);
    },
  });

  // Every call fires the POST — no session tracking
  const recordView = useCallback(() => {
    if (storyId) {
      recordViewMutation.mutate();
    }
  }, [storyId, recordViewMutation]);

  return {
    viewCount: viewCount ?? 0,
    isLoading: isLoading && viewCount === null,
    recordView,
  };
}
