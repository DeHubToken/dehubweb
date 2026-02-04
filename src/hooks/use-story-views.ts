/**
 * Story Views Hook
 * ================
 * Tracks and fetches view counts for stories.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef } from 'react';

export function useStoryViews(storyId: string | undefined) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const hasRecordedView = useRef(false);

  // Fetch view count for this story
  const { data: viewCount = 0, isLoading } = useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async (): Promise<number> => {
      if (!storyId) return 0;

      const { count, error } = await supabase
        .from('story_views' as any)
        .select('*', { count: 'exact', head: true })
        .eq('story_id', storyId);

      if (error) {
        console.error('[story-views] Error fetching view count:', error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!storyId,
    staleTime: 30000,
  });

  // Mutation to record a view
  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!storyId || !walletAddress) {
        throw new Error('Missing story ID or wallet address');
      }

      const lowerWallet = walletAddress.toLowerCase();

      // Upsert to avoid duplicate views
      const { error } = await supabase
        .from('story_views' as any)
        .upsert(
          {
            story_id: storyId,
            viewer_wallet_address: lowerWallet,
          },
          { onConflict: 'story_id,viewer_wallet_address' }
        )
        .setHeader('x-wallet-address', lowerWallet);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate to refetch count
      queryClient.invalidateQueries({ queryKey: ['story-views', storyId] });
    },
    onError: (err) => {
      console.error('[story-views] Error recording view:', err);
    },
  });

  // Record view when story is viewed
  const recordView = () => {
    if (!hasRecordedView.current && storyId && walletAddress) {
      hasRecordedView.current = true;
      recordViewMutation.mutate();
    }
  };

  // Reset recorded flag when story changes
  useEffect(() => {
    hasRecordedView.current = false;
  }, [storyId]);

  return {
    viewCount,
    isLoading,
    recordView,
  };
}
