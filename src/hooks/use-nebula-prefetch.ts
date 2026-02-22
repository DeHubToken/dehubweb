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

    const fetchFeed = async (postType: string, limit = 20) => {
      const url = new URL('/api/feed', DEHUB_API_BASE);
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sortBy', 'createdAt');
      url.searchParams.set('sortOrder', 'desc');
      url.searchParams.set('status', 'minted');
      url.searchParams.set('postType', postType);
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) return null;
      return res.json();
    };

    // Fire all 3 home feed queries + scroll carousel in parallel
    const [videosRes, imagesRes, textsRes] = await Promise.allSettled([
      fetchFeed('video'),
      fetchFeed('feed-images'),
      fetchFeed('feed-simple'),
    ]);

    // Cache results using the EXACT same query key structure as useUnifiedFeed:
    // ['unified-feed', params (without page/limit/enabled), limit]
    // HomeFeed default uses: sortBy='createdAt', sortOrder='desc', status='minted',
    // with range/category/isPPV/hasBounty/isLocked all undefined
    const cacheResult = (result: PromiseSettledResult<any>, postType: string, limit = 20) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const response = result.value;
      
      // Match the exact params shape from useUnifiedFeed hook (options minus page/limit/enabled)
      const params = {
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        range: undefined,
        status: 'minted' as const,
        category: undefined,
        isPPV: undefined,
        hasBounty: undefined,
        isLocked: undefined,
        postType,
      };
      
      queryClient.setQueryData(
        ['unified-feed', params, limit],
        {
          pages: [{ 
            items: response.result || [], 
            pagination: response.pagination, 
            page: 1,
            shuffleSeed: undefined,
          }],
          pageParams: [1],
        }
      );
      console.log(`[Nebula Prefetch] ${postType} cached:`, (response.result || []).length, 'items');
    };

    cacheResult(videosRes, 'video');
    cacheResult(imagesRes, 'feed-images');
    cacheResult(textsRes, 'feed-simple');

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

      // Fire both in parallel, don't block
      prefetchAllFeeds(queryClient, null);
      prefetchHomeFeed(queryClient);
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
