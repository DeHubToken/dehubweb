/**
 * Live Avatar Enrichment for Leaderboard
 * ========================================
 * Fetches fresh avatar URLs from the DeHub API for visible leaderboard entries,
 * so avatars stay up-to-date even when stats are cached.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiCall } from '@/lib/api/dehub/core';

interface AvatarCacheEntry {
  avatarUrl?: string;
  username?: string;
  userDisplayName?: string;
  fetchedAt: number;
}

/** How long before we re-fetch a single user's avatar (10 min) */
const AVATAR_TTL_MS = 10 * 60 * 1000;

/** Max concurrent fetches */
const CONCURRENCY = 5;

const CACHE_KEY = ['leaderboard-live-avatars'] as const;

/**
 * Hook: given a list of wallet addresses, ensures fresh avatar data
 * is in the query cache. Returns a lookup function for overrides.
 */
export function useLeaderboardAvatars(accounts: string[]) {
  const queryClient = useQueryClient();
  const fetchingRef = useRef(new Set<string>());

  // Subscribe to the avatar cache so component re-renders when data arrives
  const { data: avatarCache } = useQuery<Record<string, AvatarCacheEntry>>({
    queryKey: CACHE_KEY,
    queryFn: () => ({}),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Stable key for the effect dependency
  const accountsKey = useMemo(() => accounts.join(','), [accounts]);

  useEffect(() => {
    if (accounts.length === 0) return;

    const cache: Record<string, AvatarCacheEntry> =
      queryClient.getQueryData(CACHE_KEY) || {};

    const now = Date.now();
    const stale = accounts.filter((addr) => {
      if (fetchingRef.current.has(addr)) return false;
      const cached = cache[addr.toLowerCase()];
      return !cached || now - cached.fetchedAt > AVATAR_TTL_MS;
    });

    if (stale.length === 0) return;

    let i = 0;
    const fetchNext = async () => {
      while (i < stale.length) {
        const addr = stale[i++];
        const key = addr.toLowerCase();
        fetchingRef.current.add(addr);
        try {
          const res = await apiCall<any>(`/api/account_info/${addr}`);
          const user = res?.result || res;
          queryClient.setQueryData<Record<string, AvatarCacheEntry>>(CACHE_KEY, (prev) => ({
            ...prev,
            [key]: {
              avatarUrl: user?.avatarImageUrl || user?.avatarUrl || undefined,
              username: user?.username,
              userDisplayName: user?.displayName,
              fetchedAt: Date.now(),
            },
          }));
        } catch {
          // Silently skip failed fetches
        } finally {
          fetchingRef.current.delete(addr);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, stale.length) }, fetchNext);
    Promise.all(workers);
  }, [accountsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return avatarCache;
}

/**
 * Returns a function to look up fresh avatar data for a given address.
 */
export function useAvatarOverrides() {
  const { data: avatarCache } = useQuery<Record<string, AvatarCacheEntry>>({
    queryKey: CACHE_KEY,
    queryFn: () => ({}),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return (address: string): AvatarCacheEntry | undefined => {
    return avatarCache?.[address.toLowerCase()];
  };
}
