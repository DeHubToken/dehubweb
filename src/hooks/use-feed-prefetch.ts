/**
 * Feed Prefetch Hook
 * ==================
 * Prefetches DeHub feed data when the landing page loads,
 * so content is instantly available when users enter the app.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { searchNFTs } from '@/lib/api/dehub';

const PREFETCH_UNIT = 15;

/**
 * Prefetches the main feed data (videos and images) into React Query cache
 * Call this on the landing page to warm the cache before users enter the app
 */
export function useFeedPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch main video feed (postType: undefined)
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', {}],
      queryFn: async () => {
        const response = await searchNFTs({
          page: 0,
          unit: PREFETCH_UNIT,
        });
        
        const data = (response as any).result || response.data || [];
        
        return {
          data,
          page: 0,
          has_more: data.length >= PREFETCH_UNIT,
          total: response.total || data.length,
          unit: PREFETCH_UNIT,
        };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 5, // 5 minutes
    });

    // Prefetch image feed (postType: "feed-images")
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', { postType: 'feed-images' }],
      queryFn: async () => {
        const response = await searchNFTs({
          page: 0,
          unit: PREFETCH_UNIT,
          postType: 'feed-images',
        });
        
        const data = (response as any).result || response.data || [];
        
        return {
          data,
          page: 0,
          has_more: data.length >= PREFETCH_UNIT,
          total: response.total || data.length,
          unit: PREFETCH_UNIT,
        };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 5, // 5 minutes
    });
  }, [queryClient]);
}
