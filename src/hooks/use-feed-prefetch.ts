/**
 * Feed Prefetch Hook
 * ==================
 * Prefetches all feed tabs in the background after the home feed loads.
 * This ensures instant tab switching by warming up React Query caches.
 * 
 * CRITICAL: Query keys MUST exactly match what the actual feed components use!
 * React Query uses deep equality for cache key matching.
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
 * 
 * CRITICAL: Query keys MUST match exactly what each feed component uses!
 * This includes all keys with undefined values - React Query does deep comparison.
 */
async function prefetchAllFeeds(queryClient: ReturnType<typeof useQueryClient>, walletAddress: string | null) {
  console.log('[Prefetch] Starting background feed prefetch...');
  
  const prefetchPromises: Promise<void>[] = [];
  
  // ============================================================================
  // 1. Videos Feed - matches VideosFeed component's useUnifiedFeed call
  // ============================================================================
  // VideosFeed.tsx lines 417-428 calls useUnifiedFeed with:
  // - limit: 20
  // - postType: 'video'
  // - sortBy: getUnifiedSortBy(selectedSort.value) where default is 'random' → 'createdAt'
  // - sortOrder: 'desc'
  // - range: getUnifiedRange(selectedUploadDate.value) where default is 'all' → undefined
  // - address: walletAddress || undefined
  // - isPPV: contentFilters.ppv || undefined (default false → undefined)
  // - hasBounty: contentFilters.w2e || undefined (default false → undefined)
  // - isLocked: contentFilters.locked || undefined (default false → undefined)
  // - status: 'minted'
  //
  // useUnifiedFeed.ts line 401: const { enabled = true, limit = 20, ...params } = options;
  // useUnifiedFeed.ts line 404: queryKey: ['unified-feed', params, limit]
  //
  // So the query key is: ['unified-feed', { postType, sortBy, sortOrder, range, address, isPPV, hasBounty, isLocked, status }, 20]
  const videosParams = {
    postType: 'video' as const,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    range: undefined,
    address: walletAddress || undefined,
    isPPV: undefined,
    hasBounty: undefined,
    isLocked: undefined,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['unified-feed', videosParams, 20],
      queryFn: async () => {
        const response = await fetchUnifiedFeed({
          postType: 'video',
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
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
  
  // ============================================================================
  // 2. Images Feed - matches ImagesFeed's useDeHubImages call
  // ============================================================================
  // ImagesFeed.tsx lines 295-299 calls useDeHubImages with:
  // - unit: 15
  // - sortMode: selectedSort.value === 'most-liked' ? 'popular' : 'new'
  //   Default selectedSort is SORT_OPTIONS[0] = { label: 'Random', value: 'random' }
  //   So sortMode = 'new' (since 'random' !== 'most-liked')
  // - address: walletAddress || undefined
  //
  // useDeHubImages (use-dehub-feed.ts line 357-362) adds postType: 'feed-images'
  // useDeHubFeed (use-dehub-feed.ts line 299-301):
  //   const { enabled = true, status = 'minted', ...searchParams } = options;
  //   queryKey: ['dehub-feed', { ...searchParams, status }]
  //
  // So the query key is: ['dehub-feed', { unit, sortMode, address, postType, status }]
  const imagesParams = {
    unit: 15,
    sortMode: 'new' as const,
    address: walletAddress || undefined,
    postType: 'feed-images' as const,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', imagesParams],
      queryFn: async () => {
        const response = await searchNFTs({
          unit: 15,
          sortMode: 'new',
          address: walletAddress || undefined,
          postType: 'feed-images',
          status: 'minted',
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 15, total: data.length, unit: 15 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Images failed:', err))
  );
  
  // ============================================================================
  // 3. Shorts Feed - matches ShortsFeed's useDeHubVideos call
  // ============================================================================
  // ShortsFeed.tsx lines 253-258 calls useDeHubVideos with:
  // - unit: 15
  // - sortMode: getApiSortMode(selectedSort.value) where default is 'random' → 'new'
  // - category: selectedCategory || undefined (default is null → undefined)
  // - address: walletAddress || undefined
  //
  // useDeHubVideos (use-dehub-feed.ts line 348-350) just calls useDeHubFeed without postType
  // useDeHubFeed (use-dehub-feed.ts line 299-301):
  //   const { enabled = true, status = 'minted', ...searchParams } = options;
  //   queryKey: ['dehub-feed', { ...searchParams, status }]
  //
  // So the query key is: ['dehub-feed', { unit, sortMode, category, address, status }]
  const shortsParams = {
    unit: 15,
    sortMode: 'new' as const,
    category: undefined,
    address: walletAddress || undefined,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', shortsParams],
      queryFn: async () => {
        const response = await searchNFTs({
          unit: 15,
          sortMode: 'new',
          address: walletAddress || undefined,
          status: 'minted',
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 15, total: data.length, unit: 15 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Shorts failed:', err))
  );
  
  // ============================================================================
  // 4. Music Feed - matches MusicFeed's inline useInfiniteQuery
  // ============================================================================
  // MusicFeed.tsx line 440 uses inline useInfiniteQuery with:
  //   queryKey: ['music-videos-infinite', walletAddress]
  //
  // Note: Uses walletAddress directly (not || undefined), so could be null
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['music-videos-infinite', walletAddress],
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
  
  // ============================================================================
  // 5. Live Feed - matches LiveFeed's useDeHubLive call
  // ============================================================================
  // LiveFeed.tsx lines 63-66 calls useDeHubLive with:
  //   { unit: 15, sortMode: 'recent' }
  //
  // useDeHubLive (use-dehub-feed.ts line 368-370):
  //   queryKey: ['dehub-live', options]
  //
  // So the query key is: ['dehub-live', { unit: 15, sortMode: 'recent' }]
  const liveParams = {
    unit: 15,
    sortMode: 'recent' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-live', liveParams],
      queryFn: async () => {
        try {
          const response = await getLiveStreams({ page: 0, unit: 15, sortMode: 'recent' });
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
      // Pass walletAddress directly (can be null) to match MusicFeed's query key
      prefetchAllFeeds(queryClient, walletAddress);
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
