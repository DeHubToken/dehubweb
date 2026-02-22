/**
 * Profile Avatar Cache Hook
 * ==========================
 * Provides live avatar URLs for creators, separate from feed cache.
 * This ensures profile pictures update immediately when changed,
 * even if the feed data is stale.
 * 
 * NOW USES BATCH API: Instead of making individual API calls per creator,
 * this system batches multiple avatar requests into a single edge function call.
 * This dramatically reduces API pressure at scale (1M+ views).
 * 
 * Uses stale-while-revalidate pattern for instant display with background refresh.
 * 
 * @module hooks/use-profile-avatar-cache
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useEffect } from 'react';
import { getAccountInfo, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { supabase } from '@/integrations/supabase/client';

/** Cache time for avatar data - balanced for freshness vs API load */
const AVATAR_CACHE_STALE_MS = 5 * 60 * 1000; // 5 minutes (stale-while-revalidate friendly)
const AVATAR_CACHE_GC_MS = 30 * 60 * 1000; // 30 minutes (keep longer for instant back nav)

/** Query key prefix for avatar cache */
const AVATAR_QUERY_KEY = 'profile-avatar';

/** Batch request queue - collects addresses to fetch together */
interface BatchQueueItem {
  address: string;
  resolve: (url: string | undefined) => void;
  reject: (error: Error) => void;
}

const batchQueue: BatchQueueItem[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 50; // Collect requests for 50ms before batching
const MAX_BATCH_SIZE = 30; // Max addresses per batch request

/**
 * Process the batch queue - fetch all queued avatars in one request
 */
async function processBatchQueue() {
  if (batchQueue.length === 0) return;

  // Take items from queue
  const items = batchQueue.splice(0, MAX_BATCH_SIZE);
  const addresses = items.map(item => item.address);

  try {
    console.log(`[AvatarBatch] Fetching ${addresses.length} avatars in batch`);

    const { data, error } = await supabase.functions.invoke('batch-avatars', {
      body: { addresses },
    });

    if (error) {
      throw new Error(error.message || 'Batch avatar fetch failed');
    }

    const avatarMap = data?.avatars || {};

    // Resolve each promise with the fetched data
    for (const item of items) {
      const result = avatarMap[item.address.toLowerCase()];
      if (result?.avatarUrl) {
        const url = buildAvatarUrl(item.address, result.avatarUrl);
        item.resolve(url);
      } else {
        item.resolve(undefined);
      }
    }
  } catch (error) {
    console.error('[AvatarBatch] Batch fetch failed:', error);
    // Reject all promises in the batch
    for (const item of items) {
      item.reject(error instanceof Error ? error : new Error('Batch fetch failed'));
    }
  }

  // Process any remaining items in the queue
  if (batchQueue.length > 0) {
    processBatchQueue();
  }
}

/**
 * Queue an avatar fetch to be batched with others
 */
function queueAvatarFetch(address: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    batchQueue.push({ address: address.toLowerCase(), resolve, reject });

    // Set timeout to process batch if not already set
    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        batchTimeout = null;
        processBatchQueue();
      }, BATCH_DELAY_MS);
    }

    // If we've hit max batch size, process immediately
    if (batchQueue.length >= MAX_BATCH_SIZE) {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      processBatchQueue();
    }
  });
}

/**
 * Extract avatar URL from DeHub user response
 */
function extractUserAvatarUrl(user: DeHubUser): string | undefined {
  const rawPath = extractAvatarPath(user);
  const address = user.address || user.wallet_address || '';
  return buildAvatarUrl(address, rawPath);
}

/**
 * Hook to get a live avatar URL for a specific wallet address.
 * Uses batch API to fetch avatars efficiently - multiple requests are
 * combined into a single API call.
 * 
 * @param walletAddress - The creator's wallet address
 * @param fallbackUrl - Optional fallback URL from feed data (used while loading)
 * @returns The live avatar URL (or fallback while loading)
 */
export function useProfileAvatar(
  walletAddress: string | undefined,
  fallbackUrl?: string
): string | undefined {
  const { data: avatarUrl } = useQuery({
    queryKey: [AVATAR_QUERY_KEY, walletAddress],
    queryFn: async () => {
      if (!walletAddress) return undefined;
      try {
        // Use batch queue instead of direct API call
        const url = await queueAvatarFetch(walletAddress);
        return url || fallbackUrl;
      } catch (error) {
        console.warn('[AvatarCache] Failed to fetch avatar for', walletAddress, error);
        return fallbackUrl;
      }
    },
    enabled: !!walletAddress,
    staleTime: AVATAR_CACHE_STALE_MS,
    gcTime: AVATAR_CACHE_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    // Stale-while-revalidate: show fallback immediately, update in background
    placeholderData: fallbackUrl,
  });

  return avatarUrl ?? fallbackUrl;
}

/**
 * Hook to prefetch avatars for multiple wallet addresses at once.
 * Useful for batch-loading avatars when rendering a feed.
 * 
 * @returns prefetchAvatars function
 */
export function useAvatarPrefetch() {
  const queryClient = useQueryClient();

  const prefetchAvatars = useCallback(
    async (walletAddresses: string[]) => {
      // Dedupe and filter empty addresses
      const uniqueAddresses = [...new Set(walletAddresses.filter(Boolean))];

      // Only prefetch addresses we don't already have cached
      const uncachedAddresses = uniqueAddresses.filter(
        (addr) => !queryClient.getQueryData([AVATAR_QUERY_KEY, addr])
      );

      // Batch prefetch (up to 10 at a time to avoid API overload)
      const batch = uncachedAddresses.slice(0, 10);

      await Promise.allSettled(
        batch.map((address) =>
          queryClient.prefetchQuery({
            queryKey: [AVATAR_QUERY_KEY, address],
            queryFn: async () => {
              try {
                const user = await getAccountInfo(address);
                return extractUserAvatarUrl(user);
              } catch {
                return undefined;
              }
            },
            staleTime: AVATAR_CACHE_STALE_MS,
          })
        )
      );
    },
    [queryClient]
  );

  return { prefetchAvatars };
}

/**
 * Get cached avatar URL synchronously (if available in cache).
 * Falls back to provided URL if not in cache.
 * 
 * @param walletAddress - The creator's wallet address
 * @param fallbackUrl - Fallback URL from feed data
 * @returns Cached avatar URL or fallback
 */
export function useCachedAvatar(
  walletAddress: string | undefined,
  fallbackUrl?: string
): string | undefined {
  const queryClient = useQueryClient();

  return useMemo(() => {
    if (!walletAddress) return fallbackUrl;

    const cached = queryClient.getQueryData<string>([AVATAR_QUERY_KEY, walletAddress]);
    return cached ?? fallbackUrl;
  }, [walletAddress, fallbackUrl, queryClient]);
}

/**
 * Invalidate avatar cache for a specific user.
 * Call this after the current user updates their profile.
 */
export function useInvalidateAvatar() {
  const queryClient = useQueryClient();

  return useCallback(
    (walletAddress: string) => {
      queryClient.invalidateQueries({ queryKey: [AVATAR_QUERY_KEY, walletAddress] });
    },
    [queryClient]
  );
}
