/**
 * Profile Avatar Cache Hook
 * ==========================
 * Provides live avatar URLs for creators, separate from feed cache.
 * This ensures profile pictures update immediately when changed,
 * even if the feed data is stale.
 * 
 * Uses a short cache time (2 min) and batches requests to avoid API spam.
 * Falls back to feed-provided avatar URL if cache miss.
 * 
 * @module hooks/use-profile-avatar-cache
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getAccountInfo, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';

/** Cache time for avatar data - short to pick up profile changes quickly */
const AVATAR_CACHE_STALE_MS = 2 * 60 * 1000; // 2 minutes
const AVATAR_CACHE_GC_MS = 10 * 60 * 1000; // 10 minutes

/** Query key prefix for avatar cache */
const AVATAR_QUERY_KEY = 'profile-avatar';

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
 * This fetches fresh profile data and extracts the avatar URL.
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
        const user = await getAccountInfo(walletAddress);
        return extractUserAvatarUrl(user) || fallbackUrl;
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
    retry: 1,
    // Return fallback immediately while loading
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
