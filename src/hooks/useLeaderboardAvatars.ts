/**
 * Live Avatar Enrichment for Leaderboard
 * ========================================
 * Fetches fresh avatar URLs from the DeHub API for visible leaderboard entries,
 * so avatars stay up-to-date even when stats are cached.
 * 
 * Uses a shared, long-lived query cache keyed by wallet address.
 * Batch-fetches in parallel with concurrency limits.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

const CACHE_KEY = 'leaderboard-avatars';

/**
 * Hook: given a list of wallet addresses, ensures fresh avatar data
 * is in the query cache. Components read from the cache via getAvatarOverride.
 */
export function useLeaderboardAvatars(accounts: string[]) {
  const queryClient = useQueryClient();
  const fetchingRef = useRef(new Set<string>());

  useEffect(() => {
    if (accounts.length === 0) return;

    const cache: Record<string, AvatarCacheEntry> =
      queryClient.getQueryData([CACHE_KEY]) || {};

    const now = Date.now();
    const stale = accounts.filter((addr) => {
      if (fetchingRef.current.has(addr)) return false;
      const cached = cache[addr.toLowerCase()];
      return !cached || now - cached.fetchedAt > AVATAR_TTL_MS;
    });

    if (stale.length === 0) return;

    // Batch fetch with concurrency limit
    let i = 0;
    const fetchNext = async () => {
      while (i < stale.length) {
        const addr = stale[i++];
        const key = addr.toLowerCase();
        fetchingRef.current.add(addr);
        try {
          const res = await apiCall<any>(`/api/account_info/${addr}`);
          const user = res?.result || res;
          const prev: Record<string, AvatarCacheEntry> =
            queryClient.getQueryData([CACHE_KEY]) || {};
          queryClient.setQueryData([CACHE_KEY], {
            ...prev,
            [key]: {
              avatarUrl: user?.avatarImageUrl || user?.avatarUrl || undefined,
              username: user?.username,
              userDisplayName: user?.displayName,
              fetchedAt: Date.now(),
            },
          });
        } catch {
          // Silently skip failed fetches
        } finally {
          fetchingRef.current.delete(addr);
        }
      }
    };

    // Launch concurrent workers
    const workers = Array.from({ length: Math.min(CONCURRENCY, stale.length) }, fetchNext);
    Promise.all(workers);
  }, [accounts.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Read fresh avatar data for a single address from the shared cache.
 * Returns undefined if no fresh data is available yet.
 */
export function useAvatarOverrides(): (address: string) => AvatarCacheEntry | undefined {
  const queryClient = useQueryClient();
  return (address: string) => {
    const cache: Record<string, AvatarCacheEntry> | undefined =
      queryClient.getQueryData([CACHE_KEY]);
    return cache?.[address.toLowerCase()];
  };
}
