/**
 * Feed Prefetch Hook
 * ==================
 * Prefetches all feed tabs in the background after the home feed loads.
 * This ensures instant tab switching by warming up React Query caches.
 * 
 * @module hooks/use-feed-prefetch
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken, searchNFTs, getLiveStreams } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';

const DEHUB_API_BASE = "https://api.dehub.io";

// Delay before starting prefetch (let home feed render first)
const PREFETCH_DELAY_MS = 1000;

// Session storage key to track if prefetch was already done this session
const PREFETCH_DONE_KEY = 'feeds-prefetched';

/**
 * Fetch unified feed from API (for videos, images, shorts, music)
 */
async function fetchUnifiedFeed(params: {
  postType?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  status?: string;
}) {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', String(params.limit || 20));
  if (params.postType && params.postType !== 'all') {
    url.searchParams.set('postType', params.postType);
  }
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);
  if (params.status) url.searchParams.set('status', params.status);
  
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) throw new Error(`Feed error: ${response.status}`);
  return response.json();
}

/**
 * Prefetch all feed types to warm up React Query caches
 */
async function prefetchAllFeeds(queryClient: ReturnType<typeof useQueryClient>) {
  console.log('[Prefetch] Starting background feed prefetch...');
  
  const prefetchPromises: Promise<void>[] = [];
  
  // 1. Videos Feed - uses unified feed with video postType
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['unified-feed', { sortBy: 'likes', status: 'minted', postType: 'video' }, 20],
      queryFn: async () => {
        const response = await fetchUnifiedFeed({
          postType: 'video',
          limit: 20,
          sortBy: 'likes',
          status: 'minted',
        });
        return {
          items: response.result || [],
          pagination: response.pagination,
          page: 1,
        };
      },
      initialPageParam: 1,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Videos failed:', err))
  );
  
  // 2. Images Feed - uses feed-images postType
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', { postType: 'feed-images', status: 'minted' }],
      queryFn: async () => {
        const response = await searchNFTs({
          postType: 'feed-images',
          status: 'minted',
          page: 0,
          unit: 20,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 20, total: data.length, unit: 20 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Images failed:', err))
  );
  
  // 3. Shorts Feed - short videos (< 90s)
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', { postType: 'video', isShort: true, status: 'minted' }],
      queryFn: async () => {
        const response = await searchNFTs({
          postType: 'video',
          status: 'minted',
          page: 0,
          unit: 20,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 20, total: data.length, unit: 20 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Shorts failed:', err))
  );
  
  // 4. Music Feed
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', { category: 'Music', status: 'minted' }],
      queryFn: async () => {
        const response = await searchNFTs({
          category: 'Music',
          status: 'minted',
          page: 0,
          unit: 20,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 20, total: data.length, unit: 20 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Music failed:', err))
  );
  
  // 5. Live Feed
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-live', {}],
      queryFn: async () => {
        try {
          const response = await getLiveStreams({ page: 0, unit: 15 });
          const streams = response.result || [];
          return { data: streams, page: 0, has_more: streams.length >= 15, total: streams.length, limit: 15 };
        } catch {
          return { data: [], page: 0, has_more: false, total: 0, limit: 15 };
        }
      },
      initialPageParam: 0,
      staleTime: 1000 * 30, // Live is more dynamic
    }).catch(err => console.warn('[Prefetch] Live failed:', err))
  );
  
  // Wait for all prefetches to complete (don't block on errors)
  await Promise.allSettled(prefetchPromises);
  
  console.log('[Prefetch] Background feed prefetch complete');
}

/**
 * Hook to prefetch all feed tabs in the background
 * Call this in HomePage after the home feed has loaded
 * 
 * @param isHomeFeedLoaded - Whether the home feed has finished loading
 */
export function useFeedPrefetch(isHomeFeedLoaded: boolean) {
  const queryClient = useQueryClient();
  const hasPrefetchedRef = useRef(false);
  
  useEffect(() => {
    // Skip if home feed hasn't loaded yet
    if (!isHomeFeedLoaded) return;
    
    // Skip if already prefetched this session
    if (hasPrefetchedRef.current) return;
    
    // Check session storage to avoid re-prefetching on navigation
    const alreadyPrefetched = sessionStorage.getItem(PREFETCH_DONE_KEY);
    if (alreadyPrefetched) {
      hasPrefetchedRef.current = true;
      return;
    }
    
    // Delay prefetch to let home feed render smoothly
    const timeoutId = setTimeout(() => {
      hasPrefetchedRef.current = true;
      sessionStorage.setItem(PREFETCH_DONE_KEY, 'true');
      
      // Run prefetch in background (don't await)
      prefetchAllFeeds(queryClient);
    }, PREFETCH_DELAY_MS);
    
    return () => clearTimeout(timeoutId);
  }, [isHomeFeedLoaded, queryClient]);
}

/**
 * Clear prefetch state (call on refresh or logout)
 */
export function clearPrefetchState() {
  sessionStorage.removeItem(PREFETCH_DONE_KEY);
}
