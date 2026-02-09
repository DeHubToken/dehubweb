/**
 * Story Views Hook
 * ================
 * Tracks and fetches view counts for stories via edge function.
 * Records exactly 1 view per storyId per hook lifecycle.
 */

import { useQuery } from '@tanstack/react-query';
import { useRef, useCallback, useEffect } from 'react';

const STORIES_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stories-api`;

// Cache view counts in memory to prevent flashing on re-renders
const viewCountCache = new Map<string, number>();

export function useStoryViews(storyId: string | undefined) {
  // Track whether we already recorded a view for the current storyId
  const hasRecordedRef = useRef<string | null>(null);

  // Reset when storyId changes
  useEffect(() => {
    if (storyId && hasRecordedRef.current !== storyId) {
      hasRecordedRef.current = null;
    }
  }, [storyId]);

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

  // Use cached value if available, otherwise null (not 0) to avoid flash
  const viewCount: number | null = storyId
    ? (fetchedCount ?? viewCountCache.get(storyId) ?? null)
    : 0;

  // Stable recordView — fires exactly once per storyId, no query invalidation
  const recordView = useCallback(() => {
    if (!storyId) return;
    if (hasRecordedRef.current === storyId) return; // Already recorded

    hasRecordedRef.current = storyId;

    fetch(`${STORIES_API_URL}/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_id: storyId }),
    }).catch((err) => {
      console.error('[story-views] Error recording view:', err);
      // Reset so it can retry on next call
      if (hasRecordedRef.current === storyId) {
        hasRecordedRef.current = null;
      }
    });
  }, [storyId]);

  return {
    viewCount,
    isLoading: isLoading && viewCount === null,
    recordView,
  };
}
