/**
 * Feed Prefetch Hook
 * ==================
 * Prefetches all feed tabs in the background after the home feed loads.
 * This ensures instant tab switching by warming up React Query caches.
 * 
 * IMPORTANT: Query keys MUST exactly match what the actual feed components use!
 * 
 * @module hooks/use-feed-prefetch
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken, searchNFTs, getLiveStreams } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

const DEHUB_API_BASE = "https://api.dehub.io";

// Delay before starting prefetch (let home feed render first)
const PREFETCH_DELAY_MS = 1000;

// Session storage key to track if prefetch was already done this session
const PREFETCH_DONE_KEY = 'feeds-prefetched';

/**
 * Fetch unified feed from API (for videos)
 */
async function fetchUnifiedFeed(params: {
  postType?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  status?: string;
  address?: string;
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
 * Query keys MUST match exactly what each feed component uses
 */
async function prefetchAllFeeds(queryClient: ReturnType<typeof useQueryClient>, walletAddress?: string) {
  console.log('[Prefetch] Starting background feed prefetch...');
  
  const prefetchPromises: Promise<void>[] = [];
  
  // 1. Videos Feed - matches VideosFeed component's useUnifiedFeed call
  // VideosFeed default sort is SORT_OPTIONS[0] = 'random', but getUnifiedSortBy('random') doesn't exist
  // Looking at VideosFeed: selectedSort defaults to SORT_OPTIONS[0] which is 'random'
  // getUnifiedSortBy('random') falls through to default case and returns 'createdAt'
  // Actually, checking the switch: 'random' is not handled, so it falls to default = 'createdAt'
  // Query key: ['unified-feed', params, limit]
  const videosParams = {
    postType: 'video' as const,
    sortBy: 'createdAt' as const, // Default for 'random' → falls through to 'createdAt'
    sortOrder: 'desc' as const,
    status: 'minted' as const,
    address: walletAddress || undefined, // Always include address key
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['unified-feed', videosParams, 20],
      queryFn: async () => {
        const response = await fetchUnifiedFeed({
          ...videosParams,
          limit: 20,
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
  
  // 2. Images Feed - matches ImagesFeed's useDeHubImages call
  // useDeHubImages({ unit: 15, sortMode, address }) -> useDeHubFeed with postType: 'feed-images'
  // Default sortMode: selectedSort.value === 'most-liked' ? 'popular' : 'new'
  // Default selectedSort is SORT_OPTIONS[0] = 'random', so sortMode = 'new'
  // Query key: ['dehub-feed', { postType, status, unit, sortMode?, address? }]
  const imagesParams: { postType: 'feed-images'; status: 'minted'; unit: number; sortMode: 'new'; address: string | undefined } = {
    postType: 'feed-images',
    status: 'minted',
    unit: 15,
    sortMode: 'new', // Default: 'random' maps to 'new'
    address: walletAddress || undefined, // Always include address key
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', imagesParams],
      queryFn: async () => {
        const response = await searchNFTs({
          ...imagesParams,
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 15, total: data.length, unit: 15 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Images failed:', err))
  );
  
  // 3. Shorts Feed - matches ShortsFeed's useDeHubVideos call
  // useDeHubVideos({ unit: 15, sortMode, category?, address }) -> useDeHubFeed with no postType
  // Default sortMode: getApiSortMode('random') = 'new'
  // Query key: ['dehub-feed', { status, unit, sortMode?, category?, address? }]
  const shortsParams: { status: 'minted'; unit: number; sortMode: 'new'; address: string | undefined } = {
    status: 'minted',
    unit: 15,
    sortMode: 'new', // Default: 'random' maps to 'new' via getApiSortMode
    address: walletAddress || undefined, // Always include address key
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', shortsParams],
      queryFn: async () => {
        const response = await searchNFTs({
          ...shortsParams,
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 15, total: data.length, unit: 15 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Shorts failed:', err))
  );
  
  // 4. Music Feed - matches MusicFeed's inline useInfiniteQuery
  // Query key: ['music-videos-infinite', walletAddress]
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['music-videos-infinite', walletAddress || null],
      queryFn: async () => {
        const response = await searchNFTs({
          category: 'Music',
          postType: 'video',
          unit: 10, // VIDEOS_PAGE_SIZE from MusicFeed
          page: 1,
          sortMode: 'new',
          address: walletAddress || undefined,
        });
        const filteredData = (response.data || []).filter((nft: any) => {
          const displayName = (nft.minterDisplayName || nft.mintername || '').toLowerCase();
          const username = (nft.creator?.username || '').toLowerCase();
          const blocked = ['monkey d luffy', 'monkey d. luffy', 'monkeydluffy', 'monkey_d_luffy'];
          return !blocked.some(b => displayName.includes(b) || username.includes(b));
        });
        return {
          items: filteredData,
          nextPage: (response.data?.length ?? 0) >= 10 ? 2 : undefined,
        };
      },
      getNextPageParam: (lastPage: any) => lastPage.nextPage,
      initialPageParam: 1,
      staleTime: 5 * 60 * 1000,
    }).catch(err => console.warn('[Prefetch] Music failed:', err))
  );
  
  // 5. Live Feed - matches LiveFeed's useDeHubLive call
  // Query key: ['dehub-live', { unit?, sortMode?, category? }]
  const liveParams = {};
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-live', liveParams],
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
  const { walletAddress } = useAuth();
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
      prefetchAllFeeds(queryClient, walletAddress || undefined);
    }, PREFETCH_DELAY_MS);
    
    return () => clearTimeout(timeoutId);
  }, [isHomeFeedLoaded, queryClient, walletAddress]);
}

/**
 * Clear prefetch state (call on refresh or logout)
 */
export function clearPrefetchState() {
  sessionStorage.removeItem(PREFETCH_DONE_KEY);
}
