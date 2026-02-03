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

// No delay - start prefetching immediately when home feed loads
const PREFETCH_DELAY_MS = 0;

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
  if (params.address) url.searchParams.set('address', params.address);
  
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
 * 
 * For feeds with user-specific variants (Videos, Images, Shorts), we prefetch BOTH:
 * 1. Public feed (address: undefined) - for logged-out or before wallet connects
 * 2. Authenticated feed (address: walletAddress) - for logged-in users
 */
async function prefetchAllFeeds(queryClient: ReturnType<typeof useQueryClient>, walletAddress: string | null) {
  console.log('[Prefetch] Starting background feed prefetch, walletAddress:', walletAddress ? 'present' : 'null');
  
  const prefetchPromises: Promise<void>[] = [];
  
  // ============================================================================
  // 1. Videos Feed - matches VideosFeed component's useUnifiedFeed call
  // ============================================================================
  // VideosFeed.tsx line 417-428 calls useUnifiedFeed with exact params
  // useUnifiedFeed.ts line 404: queryKey: ['unified-feed', params, limit]
  // 
  // IMPORTANT: Prefetch BOTH public and authenticated variants
  
  // 1a. Videos - PUBLIC feed (address: undefined)
  const videosParamsPublic = {
    postType: 'video' as const,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    range: undefined,
    address: undefined,
    isPPV: undefined,
    hasBounty: undefined,
    isLocked: undefined,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['unified-feed', videosParamsPublic, 12],
      queryFn: async () => {
        const response = await fetchUnifiedFeed({
          postType: 'video',
          limit: 12,
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
    }).catch(err => console.warn('[Prefetch] Videos (public) failed:', err))
  );
  
  // 1b. Videos - AUTHENTICATED feed (if user is logged in)
  if (walletAddress) {
    const videosParamsAuth = {
      postType: 'video' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      range: undefined,
      address: walletAddress,
      isPPV: undefined,
      hasBounty: undefined,
      isLocked: undefined,
      status: 'minted' as const,
    };
    prefetchPromises.push(
      queryClient.prefetchInfiniteQuery({
        queryKey: ['unified-feed', videosParamsAuth, 12],
        queryFn: async () => {
          const response = await fetchUnifiedFeed({
            postType: 'video',
            limit: 12,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            status: 'minted',
            address: walletAddress,
          });
          return {
            items: response.result || [],
            pagination: response.pagination,
            page: 1,
          };
        },
        initialPageParam: 1,
        staleTime: 1000 * 60 * 10,
      }).catch(err => console.warn('[Prefetch] Videos (auth) failed:', err))
    );
  }
  
  // ============================================================================
  // 2. Images Feed - matches ImagesFeed's useDeHubImages call
  // ============================================================================
  // ImagesFeed.tsx line 295-299: useDeHubImages({ unit: 15, sortMode: 'new', address })
  // useDeHubImages adds postType: 'feed-images'
  // useDeHubFeed line 303: queryKey: ['dehub-feed', { ...searchParams, status }]
  
  // 2a. Images - PUBLIC feed (address: undefined)
  const imagesParamsPublic = {
    unit: 12,
    sortMode: 'new' as const,
    address: undefined,
    postType: 'feed-images' as const,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', imagesParamsPublic],
      queryFn: async () => {
        const response = await searchNFTs({
          unit: 12,
          sortMode: 'new',
          postType: 'feed-images',
          status: 'minted',
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 12, total: data.length, unit: 12 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Images (public) failed:', err))
  );
  
  // 2b. Images - AUTHENTICATED feed (if user is logged in)
  if (walletAddress) {
    const imagesParamsAuth = {
      unit: 12,
      sortMode: 'new' as const,
      address: walletAddress,
      postType: 'feed-images' as const,
      status: 'minted' as const,
    };
    prefetchPromises.push(
      queryClient.prefetchInfiniteQuery({
        queryKey: ['dehub-feed', imagesParamsAuth],
        queryFn: async () => {
          const response = await searchNFTs({
            unit: 12,
            sortMode: 'new',
            address: walletAddress,
            postType: 'feed-images',
            status: 'minted',
            page: 0,
          });
          const data = (response as any).result || response.data || [];
          return { data, page: 0, has_more: data.length >= 12, total: data.length, unit: 12 };
        },
        initialPageParam: 0,
        staleTime: 1000 * 60 * 10,
      }).catch(err => console.warn('[Prefetch] Images (auth) failed:', err))
    );
  }
  
  // ============================================================================
  // 3. Shorts Feed - matches ShortsFeed's useDeHubVideos call
  // ============================================================================
  // ShortsFeed.tsx line 253-258: useDeHubVideos({ unit: 15, sortMode, category, address })
  // useDeHubVideos just calls useDeHubFeed without postType
  // useDeHubFeed line 303: queryKey: ['dehub-feed', { ...searchParams, status }]
  
  // 3a. Shorts - PUBLIC feed (address: undefined, category: undefined)
  const shortsParamsPublic = {
    unit: 12,
    sortMode: 'new' as const,
    category: undefined,
    address: undefined,
    status: 'minted' as const,
  };
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['dehub-feed', shortsParamsPublic],
      queryFn: async () => {
        const response = await searchNFTs({
          unit: 12,
          sortMode: 'new',
          status: 'minted',
          page: 0,
        });
        const data = (response as any).result || response.data || [];
        return { data, page: 0, has_more: data.length >= 12, total: data.length, unit: 12 };
      },
      initialPageParam: 0,
      staleTime: 1000 * 60 * 10,
    }).catch(err => console.warn('[Prefetch] Shorts (public) failed:', err))
  );
  
  // 3b. Shorts - AUTHENTICATED feed (if user is logged in)
  if (walletAddress) {
    const shortsParamsAuth = {
      unit: 12,
      sortMode: 'new' as const,
      category: undefined,
      address: walletAddress,
      status: 'minted' as const,
    };
    prefetchPromises.push(
      queryClient.prefetchInfiniteQuery({
        queryKey: ['dehub-feed', shortsParamsAuth],
        queryFn: async () => {
          const response = await searchNFTs({
            unit: 12,
            sortMode: 'new',
            address: walletAddress,
            status: 'minted',
            page: 0,
          });
          const data = (response as any).result || response.data || [];
          return { data, page: 0, has_more: data.length >= 12, total: data.length, unit: 12 };
        },
        initialPageParam: 0,
        staleTime: 1000 * 60 * 10,
      }).catch(err => console.warn('[Prefetch] Shorts (auth) failed:', err))
    );
  }
  
  // ============================================================================
  // 4. Music Feed - matches MusicFeed's inline useInfiniteQuery
  // ============================================================================
  // MusicFeed.tsx line 440: queryKey: ['music-videos-infinite', walletAddress]
  // Note: Uses walletAddress directly - can be null, not undefined
  prefetchPromises.push(
    queryClient.prefetchInfiniteQuery({
      queryKey: ['music-videos-infinite', walletAddress],
      queryFn: async () => {
        const response = await searchNFTs({
          category: 'Music',
          postType: 'video',
          unit: 10,
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
  // LiveFeed.tsx line 63-66: useDeHubLive({ unit: 15, sortMode: 'recent' })
  // useDeHubLive line 370: queryKey: ['dehub-live', options]
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
      staleTime: 1000 * 30,
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
 * IMPORTANT: Waits for wallet state to stabilize (isConnecting = false)
 * before prefetching to ensure correct walletAddress is used.
 * 
 * @param isHomeFeedLoaded - Whether the home feed has finished loading
 */
export function useFeedPrefetch(isHomeFeedLoaded: boolean) {
  const queryClient = useQueryClient();
  const { walletAddress, isConnecting } = useAuth();
  const hasPrefetchedRef = useRef(false);
  
  useEffect(() => {
    // Skip if home feed hasn't loaded yet
    if (!isHomeFeedLoaded) return;
    
    // CRITICAL: Wait for wallet connection to stabilize
    // If we prefetch while isConnecting=true, walletAddress might change after,
    // causing cache misses when the actual feed components render
    if (isConnecting) {
      console.log('[Prefetch] Waiting for wallet connection to stabilize...');
      return;
    }
    
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
      prefetchAllFeeds(queryClient, walletAddress);
    }, PREFETCH_DELAY_MS);
    
    return () => clearTimeout(timeoutId);
  }, [isHomeFeedLoaded, queryClient, walletAddress, isConnecting]);
}

/**
 * Clear prefetch state (call on refresh or logout)
 */
export function clearPrefetchState() {
  sessionStorage.removeItem(PREFETCH_DONE_KEY);
}
