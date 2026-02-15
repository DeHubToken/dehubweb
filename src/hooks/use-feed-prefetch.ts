/**
 * Feed Prefetch Hook
 * ==================
 * Prefetches all feed tabs in the background after the home feed loads.
 * This ensures instant tab switching by warming up React Query caches.
 * 
 * CRITICAL: Query keys MUST exactly match what the actual feed components use!
 * React Query uses deep equality for cache key matching.
 * 
 * ARCHITECTURE: Fire all raw fetch() calls simultaneously, then populate cache
 * with setQueryData. This ensures TRUE parallel HTTP requests.
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
  // address param is deprecated - viewer context comes from JWT token
  
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
 * Prefetch all feed types using TRUE parallel HTTP requests.
 * 
 * Strategy:
 * 1. Fire ALL fetch() calls immediately (they start HTTP requests instantly)
 * 2. Wait for all to complete with Promise.allSettled
 * 3. Populate React Query cache with setQueryData
 * 
 * This ensures all HTTP requests go out at the same time instead of sequentially.
 */
export async function prefetchAllFeeds(queryClient: ReturnType<typeof useQueryClient>, walletAddress: string | null) {
  console.log('[Prefetch] Starting TRUE PARALLEL feed prefetch, walletAddress:', walletAddress ? 'present' : 'null');
  const startTime = Date.now();
  
  // ============================================================================
  // STEP 1: FIRE ALL FETCH CALLS IMMEDIATELY (TRUE PARALLEL)
  // ============================================================================
  // These promises start their HTTP requests the moment they're created
  
  // Videos (JWT provides viewer context, no need for separate auth/public calls)
  const videosPromise = fetchUnifiedFeed({
    postType: 'video',
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    status: 'minted',
  });
  
  // Images
  const imagesPromise = searchNFTs({
    unit: 12,
    sortMode: 'new',
    postType: 'feed-images',
    status: 'minted',
    page: 0,
  });
  
  // Shorts (postType: 'video' to match ShortsFeed component query key)
  const shortsPromise = searchNFTs({
    unit: 12,
    sortMode: 'new',
    postType: 'video',
    status: 'minted',
    page: 0,
  });
  
  // Music
  const musicPromise = searchNFTs({
    category: 'Music',
    postType: 'video',
    unit: 10,
    page: 1,
    sortMode: 'new',
  });
  
  // Live - no auth needed
  const livePromise = getLiveStreams({ page: 1, unit: 15, sortMode: 'recent' }).catch(() => ({ result: [] }));
  
  // ============================================================================
  // STEP 2: WAIT FOR ALL TO COMPLETE (TRULY PARALLEL!)
  // ============================================================================
  const [
    videosResult,
    imagesResult,
    shortsResult,
    musicResult,
    liveResult,
  ] = await Promise.allSettled([
    videosPromise,
    imagesPromise,
    shortsPromise,
    musicPromise,
    livePromise,
  ]);
  
  console.log(`[Prefetch] All HTTP requests completed in ${Date.now() - startTime}ms`);
  
  // ============================================================================
  // STEP 3: POPULATE REACT QUERY CACHE
  // ============================================================================
  
  // Videos
  if (videosResult.status === 'fulfilled') {
    const response = videosResult.value;
    const videosParams = {
      postType: 'video' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      range: undefined,
      isPPV: undefined,
      hasBounty: undefined,
      isLocked: undefined,
      status: 'minted' as const,
    };
    queryClient.setQueryData(
      ['unified-feed', videosParams, 12],
      {
        pages: [{
          items: response.result || [],
          pagination: response.pagination,
          page: 1,
        }],
        pageParams: [1],
      }
    );
    console.log('[Prefetch] Videos cached:', (response.result || []).length, 'items');
  }
  
  // Images
  if (imagesResult.status === 'fulfilled') {
    const response = imagesResult.value as any;
    const data = response.result || response.data || [];
    const imagesParams = {
      unit: 12,
      sortMode: 'new' as const,
      postType: 'feed-images' as const,
      status: 'minted' as const,
    };
    queryClient.setQueryData(
      ['dehub-feed', imagesParams],
      {
        pages: [{
          data,
          page: 0,
          has_more: data.length >= 12,
          total: data.length,
          unit: 12,
        }],
        pageParams: [0],
      }
    );
    console.log('[Prefetch] Images cached:', data.length, 'items');
  }
  
  // Shorts
  if (shortsResult.status === 'fulfilled') {
    const response = shortsResult.value as any;
    const data = response.result || response.data || [];
    const shortsParams = {
      unit: 12,
      sortMode: 'new' as const,
      category: undefined,
      postType: 'video' as const,
      status: 'minted' as const,
    };
    queryClient.setQueryData(
      ['dehub-feed', shortsParams],
      {
        pages: [{
          data,
          page: 0,
          has_more: data.length >= 12,
          total: data.length,
          unit: 12,
        }],
        pageParams: [0],
      }
    );
    console.log('[Prefetch] Shorts cached:', data.length, 'items');
  }
  
  // Music
  if (musicResult.status === 'fulfilled') {
    const response = musicResult.value as any;
    const data = response.result || response.data || [];
    // Filter blocked creators
    const filteredData = data.filter((nft: any) => {
      const displayName = (nft.minterDisplayName || nft.mintername || '').toLowerCase();
      const username = (nft.creator?.username || '').toLowerCase();
      const blocked = ['monkey d luffy', 'monkey d. luffy', 'monkeydluffy', 'monkey_d_luffy'];
      return !blocked.some(b => displayName.includes(b) || username.includes(b));
    });
    queryClient.setQueryData(
      ['music-videos-infinite', walletAddress],
      {
        pages: [{
          items: filteredData,
          nextPage: data.length >= 10 ? 2 : undefined,
        }],
        pageParams: [1],
      }
    );
    console.log('[Prefetch] Music cached:', filteredData.length, 'items');
  }
  
  // Live
  if (liveResult.status === 'fulfilled') {
    const response = liveResult.value as any;
    const streams = response.result || [];
    const liveParams = {
      unit: 15,
      sortMode: 'recent' as const,
    };
    queryClient.setQueryData(
      ['dehub-live', liveParams],
      {
        pages: [{
          data: streams,
          page: 1,
          has_more: streams.length >= 15,
          total: streams.length,
          limit: 15,
        }],
        pageParams: [1],
      }
    );
    console.log('[Prefetch] Live cached:', streams.length, 'items');
  }
  
  console.log(`[Prefetch] Complete - total time: ${Date.now() - startTime}ms`);
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
