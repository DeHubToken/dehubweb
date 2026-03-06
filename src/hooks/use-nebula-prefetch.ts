/**
 * Nebula Prefetch Hook
 * ====================
 * Triggers feed data prefetch on first user interaction with the nebula hero.
 * This ensures the app content is already cached when the user clicks X to enter.
 * 
 * Listens for: mousemove, touchstart, scroll, wheel
 * Fires once per session, does not slow down initial nebula load.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchAllFeeds } from '@/hooks/use-feed-prefetch';
import { getAuthToken } from '@/lib/api/dehub';

const DEHUB_API_BASE = "https://api.dehub.io";
const PREFETCH_TRIGGERED_KEY = 'nebula-prefetch-triggered';

/**
 * Prefetch the home feed's 3 interleaved queries (video, images, text)
 * to match what HomeFeed.tsx renders by default.
 */
async function prefetchHomeFeed(queryClient: ReturnType<typeof useQueryClient>) {
  try {
    const token = getAuthToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const fetchFeed = async (postType: string) => {
      const url = new URL('/api/feed', DEHUB_API_BASE);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', '20');
      url.searchParams.set('sortBy', 'createdAt');
      url.searchParams.set('sortOrder', 'desc');
      url.searchParams.set('status', 'minted');
      url.searchParams.set('postType', postType);
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) return null;
      return res.json();
    };

    // Fire 3 home feed queries + unified home feed in parallel (removed duplicate scroll carousel fetch)
    const [videosRes, imagesRes, textsRes, unifiedHomeRes] = await Promise.allSettled([
      fetchFeed('video'),
      fetchFeed('feed-images'),
      fetchFeed('feed-simple'),
      (async () => {
        // Unified home feed (no postType filter) - matches "Latest" sort in HomeFeed
        const url = new URL('/api/feed', DEHUB_API_BASE);
        url.searchParams.set('page', '1');
        url.searchParams.set('limit', '20');
        url.searchParams.set('sortBy', 'createdAt');
        url.searchParams.set('sortOrder', 'desc');
        url.searchParams.set('status', 'minted');
        const res = await fetch(url.toString(), { headers });
        if (!res.ok) return null;
        return res.json();
      })(),
    ]);

    const baseParams = {
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      range: undefined,
      status: 'minted' as const,
      category: undefined,
      isPPV: undefined,
      hasBounty: undefined,
      isLocked: undefined,
    };

    const cacheResult = (result: PromiseSettledResult<any>, postType: string, limit = 20) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const response = result.value;
      const params = { ...baseParams, postType };
      queryClient.setQueryData(
        ['unified-feed', params, limit],
        {
          pages: [{ items: response.result || [], pagination: response.pagination, page: 1 }],
          pageParams: [1],
        }
      );
      console.log(`[Nebula Prefetch] ${postType} cached:`, (response.result || []).length, 'items');
    };

    cacheResult(videosRes, 'video');
    cacheResult(imagesRes, 'feed-images');
    cacheResult(textsRes, 'feed-simple');
    
    // Scroll carousel: reuse the video data (same endpoint, just sliced)
    if (videosRes.status === 'fulfilled' && videosRes.value) {
      const scrollParams = {
        postType: 'video',
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        status: 'minted' as const,
      };
      queryClient.setQueryData(
        ['unified-feed', scrollParams, 10],
        {
          pages: [{ items: (videosRes.value.result || []).slice(0, 10), pagination: videosRes.value.pagination, page: 1 }],
          pageParams: [1],
        }
      );
    }

    // Unified home feed (no postType) - matches HomeFeed "Latest" query key exactly
    if (unifiedHomeRes.status === 'fulfilled' && unifiedHomeRes.value) {
      const homeFeedParams = {
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        range: undefined,
        isPPV: undefined,
        hasBounty: undefined,
        isLocked: undefined,
        status: 'minted' as const,
        category: undefined,
        followingOnly: undefined,
        postType: undefined,
      };
      queryClient.setQueryData(
        ['unified-feed', homeFeedParams, 20],
        {
          pages: [{ items: unifiedHomeRes.value.result || [], pagination: unifiedHomeRes.value.pagination, page: 1 }],
          pageParams: [1],
        }
      );
      console.log('[Nebula Prefetch] Unified home feed cached:', (unifiedHomeRes.value.result || []).length, 'items');
    }

    console.log('[Nebula Prefetch] Home feeds cached successfully');
  } catch (e) {
    console.warn('[Nebula Prefetch] Home feed prefetch failed:', e);
  }
}

export function useNebulaPrefetch() {
  const queryClient = useQueryClient();
  const hasFiredRef = useRef(false);

  useEffect(() => {
    // Skip if already prefetched this session
    if (sessionStorage.getItem(PREFETCH_TRIGGERED_KEY)) return;

    const triggerPrefetch = () => {
      if (hasFiredRef.current) return;
      hasFiredRef.current = true;

      // Remove listeners immediately
      cleanup();

      console.log('[Nebula Prefetch] User interaction detected, starting prefetch...');
      sessionStorage.setItem(PREFETCH_TRIGGERED_KEY, 'true');

      // Fire home feed FIRST for priority, then other tabs after a short delay
      prefetchHomeFeed(queryClient);
      setTimeout(() => prefetchAllFeeds(queryClient, null), 1500);
    };

    const events = ['mousemove', 'touchstart', 'scroll', 'wheel'] as const;
    
    events.forEach(evt => {
      window.addEventListener(evt, triggerPrefetch, { once: true, passive: true });
    });

    const cleanup = () => {
      events.forEach(evt => {
        window.removeEventListener(evt, triggerPrefetch);
      });
    };

    return cleanup;
  }, [queryClient]);
}
