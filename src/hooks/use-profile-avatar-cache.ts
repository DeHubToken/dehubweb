/**
 * Profile Avatar Cache Hook
 * ==========================
 * Provides live avatar URLs for creators using direct DeHub API calls.
 * No edge function needed — calls go straight to the public DeHub API
 * with TanStack Query caching to minimize network requests.
 * 
 * Uses stale-while-revalidate pattern for instant display with background refresh.
 * 
 * @module hooks/use-profile-avatar-cache
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getAccountInfo, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';

/** Cache time for avatar data - balanced for freshness vs API load */
const AVATAR_CACHE_STALE_MS = 5 * 60 * 1000; // 5 minutes
const AVATAR_CACHE_GC_MS = 30 * 60 * 1000; // 30 minutes

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
 * Fetch a single avatar directly from the DeHub API.
 * TanStack Query handles deduplication and caching.
 */
async function fetchAvatarDirect(address: string): Promise<string | null> {
  try {
    const user = await getAccountInfo(address);
    return extractUserAvatarUrl(user) ?? null;
  } catch {
    return null;
  }
}

/**
 * Hook to get a live avatar URL for a specific wallet address.
 * Uses direct DeHub API calls with TanStack Query caching.
 */
export function useProfileAvatar(
  walletAddress: string | undefined,
  fallbackUrl?: string
): string | undefined {
  const { data: avatarUrl } = useQuery({
    queryKey: [AVATAR_QUERY_KEY, walletAddress],
    queryFn: () => fetchAvatarDirect(walletAddress!),
    enabled: !!walletAddress,
    staleTime: AVATAR_CACHE_STALE_MS,
    gcTime: AVATAR_CACHE_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: fallbackUrl,
  });

  return avatarUrl ?? fallbackUrl;
}

/**
 * Hook to prefetch avatars for multiple wallet addresses at once.
 * Uses direct DeHub API calls — TanStack Query deduplicates automatically.
 */
export function useAvatarPrefetch() {
  const queryClient = useQueryClient();

  const prefetchAvatars = useCallback(
    async (walletAddresses: string[]) => {
      const uniqueAddresses = [...new Set(walletAddresses.filter(Boolean))];

      const uncachedAddresses = uniqueAddresses.filter(
        (addr) => !queryClient.getQueryData([AVATAR_QUERY_KEY, addr])
      );

      // Prefetch up to 10 at a time
      const batch = uncachedAddresses.slice(0, 10);

      await Promise.allSettled(
        batch.map((address) =>
          queryClient.prefetchQuery({
            queryKey: [AVATAR_QUERY_KEY, address],
            queryFn: () => fetchAvatarDirect(address),
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
