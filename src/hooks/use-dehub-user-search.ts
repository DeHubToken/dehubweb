/**
 * DeHub User Search Hook
 * =======================
 * Provides exact username lookup as a fallback for @username queries.
 * 
 * @module hooks/use-dehub-user-search
 */

import { useQuery } from '@tanstack/react-query';
import { getAccountByUsername, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useDebouncedValue } from './use-debounced-value';
import type { SearchCreator } from './use-dehub-search';

/**
 * Map DeHub user to SearchCreator format
 */
export function mapUserToSearchCreator(user: DeHubUser): SearchCreator {
  const rawAvatarUrl = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
  const address = user.address || user.wallet_address || '';
  
  return {
    id: user._id || user.id || address || '',
    name: user.displayName || user.display_name || user.username || 'Unknown User',
    handle: user.username ? `@${user.username.replace('@', '')}` : '@unknown',
    avatar: buildAvatarUrl(address, rawAvatarUrl),
    verified: user.isVerified || user.is_verified || false,
    bio: user.bio,
  };
}

export interface UseDeHubUserSearchOptions {
  /** Search query (should start with @ for username lookup) */
  query: string;
  /** Whether the search is enabled */
  enabled?: boolean;
  /** Force exact lookup even without @ prefix (for short queries) */
  forceExactLookup?: boolean;
}

/**
 * Hook to search for a user by exact username match
 * Triggers when query starts with @ OR when forceExactLookup is true
 */
export function useDeHubUserSearch({ 
  query, 
  enabled = true,
  forceExactLookup = false,
}: UseDeHubUserSearchOptions) {
  // Debounce the query
  const debouncedQuery = useDebouncedValue(query, 300);
  
  // Check if this is a username query (starts with @)
  const isUsernameQuery = debouncedQuery.trim().startsWith('@');
  const cleanUsername = debouncedQuery.trim().replace(/^@/, '').trim();
  
  // Enable for @ queries with 1+ chars, OR for forced lookups with 1+ chars
  const shouldFetch = enabled && cleanUsername.length >= 1 && (
    isUsernameQuery || forceExactLookup
  );

  const result = useQuery({
    queryKey: ['dehub-user-search', cleanUsername],
    queryFn: async () => {
      const user = await getAccountByUsername(cleanUsername);
      return mapUserToSearchCreator(user);
    },
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry on 404 (user not found)
  });

  return {
    ...result,
    isUsernameQuery,
    cleanUsername,
  };
}
