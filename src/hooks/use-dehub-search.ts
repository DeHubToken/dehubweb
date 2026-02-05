/**
 * DeHub Search Hook
 * ==================
 * Provides search functionality using the DeHub /api/search endpoint.
 * Includes debouncing, pagination, and content type filtering.
 * 
 * @module hooks/use-dehub-search
 */

import { useInfiniteQuery, useQuery, useMutation } from '@tanstack/react-query';
import { 
  universalSearch,
  getSearchSuggestions,
  logSearchAnalytics,
  type DeHubNFT, 
  type SearchAccount,
  type SearchLivestream,
  type UniversalSearchResponse,
  type SearchSuggestion,
  type SearchLogParams,
} from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { useDebouncedValue } from './use-debounced-value';

export interface SearchCreator {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  verified: boolean;
  bio?: string;
  followerCount?: number;
}

export interface UseDeHubSearchOptions {
  /** Search query text */
  query: string;
  /** Search type filter: "accounts" | "videos" | "livestreams" | undefined for all */
  type?: 'accounts' | 'videos' | 'livestreams';
  /** Post type filter for videos: "video" | "feed-images" | "feed-simple" | "feed-all" */
  postType?: string;
  /** Whether the search is enabled */
  enabled?: boolean;
  /** User wallet address for like/dislike state */
  address?: string;
  /** Items per page */
  limit?: number;
  /** Category filter (for legacy compatibility) */
  category?: string;
  /** Sort mode (for legacy compatibility) */
  sortMode?: 'new' | 'popular' | 'trending';
  /** Minimum query length required (default: 3) */
  minQueryLength?: number;
}

export interface SearchPageResult {
  accounts: SearchAccount[];
  videos: DeHubNFT[];
  livestreams: SearchLivestream[];
  page: number;
  hasMore: boolean;
  total?: number;
}

/**
 * Map tab name to API type parameter
 */
export function getTypeForTab(tab: string): 'accounts' | 'videos' | 'livestreams' | undefined {
  switch (tab) {
    case 'people':
      return 'accounts';
    case 'videos':
    case 'images':
    case 'music':
      return 'videos';
    case 'live':
      return 'livestreams';
    default:
      return undefined; // search all
  }
}

/**
 * Map tab name to API postType parameter (for video type searches)
 */
export function getPostTypeForTab(tab: string): string | undefined {
  switch (tab) {
    case 'images':
      return 'feed-images';
    case 'videos':
      return 'video';
    case 'music':
      return 'audio';
    default:
      return undefined;
  }
}

/**
 * Convert SearchAccount to SearchCreator format
 */
export function mapAccountToCreator(account: SearchAccount): SearchCreator {
  // Use centralized utility - handles all avatar field variations
  const rawAvatarPath = extractAvatarPath(account);
  
  return {
    id: account.address || account.id,
    name: account.displayName || account.username || 'User',
    handle: `@${account.username || account.address?.slice(0, 8)}`,
    avatar: rawAvatarPath 
      ? buildAvatarUrl(account.address, rawAvatarPath) 
      : undefined,
    verified: account.verified || false,
    bio: account.bio,
    followerCount: account.followerCount,
  };
}

/**
 * Extract unique creators from NFT results (for backwards compatibility)
 */
export function extractUniqueCreators(nfts: DeHubNFT[]): SearchCreator[] {
  const creatorMap = new Map<string, SearchCreator>();

  if (!Array.isArray(nfts)) return [];

  nfts.forEach((nft) => {
    // Skip if no nft or minter info available
    if (!nft || !nft.minter) return;
    
    const minterId = nft.minter;
    if (creatorMap.has(minterId)) return;
    
    // API uses minterUsername (preferred) or mintername as fallback
    const username = nft.minterUsername || nft.mintername;

    creatorMap.set(minterId, {
      id: minterId,
      name: nft.minterDisplayName || username || 'User',
      handle: `@${username || minterId.slice(0, 8)}`,
      avatar: buildAvatarUrl(minterId, extractAvatarPath(nft)),
      verified: false, // API doesn't return verification on NFT objects
      bio: undefined,
    });
  });

  return Array.from(creatorMap.values()).filter(creator => creator.id);
}

/**
 * Hook to search DeHub content with debouncing and pagination
 */
export function useDeHubSearch({
  query,
  type,
  postType,
  enabled = true,
  address,
  limit = 15,
  minQueryLength = 3,
}: UseDeHubSearchOptions) {
  // Debounce the query to prevent excessive API calls
  const debouncedQuery = useDebouncedValue(query, 300);

  // Only enable if query meets minimum length requirement
  const shouldFetch = enabled && debouncedQuery.trim().length >= minQueryLength;

  return useInfiniteQuery({
    queryKey: ['dehub-search', debouncedQuery.trim(), type, postType],
    queryFn: async ({ pageParam = 0 }): Promise<SearchPageResult> => {
      const result = await universalSearch({
        q: debouncedQuery.trim(),
        type,
        postType,
        page: pageParam,
        unit: limit,
        address,
      });

      return {
        accounts: result.accounts || [],
        videos: result.videos || [],
        livestreams: result.livestreams || [],
        page: pageParam,
        hasMore: result.has_more || false,
        total: result.total,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 2,
  });
}

/**
 * Utility to get all accounts from paginated search results
 */
export function flattenSearchAccounts(data: { pages: Array<SearchPageResult> } | undefined): SearchAccount[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.accounts || []).filter(Boolean);
}

/**
 * Utility to get all videos from paginated search results
 */
export function flattenSearchVideos(data: { pages: Array<SearchPageResult> } | undefined): DeHubNFT[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.videos || []).filter(Boolean);
}

/**
 * Utility to get all livestreams from paginated search results
 */
export function flattenSearchLivestreams(data: { pages: Array<SearchPageResult> } | undefined): SearchLivestream[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.livestreams || []).filter(Boolean);
}

/**
 * Legacy function - flattens video results for backwards compatibility
 */
export function flattenSearchResults(data: { pages: Array<SearchPageResult> } | undefined): DeHubNFT[] {
  return flattenSearchVideos(data);
}

/**
 * Map NFTs to appropriate content types (backwards compatibility)
 */
export function mapNFTsToContent(nfts: DeHubNFT[]): {
  videos: DeHubNFT[];
  images: DeHubNFT[];
  all: DeHubNFT[];
}  {
  const videos: DeHubNFT[] = [];
  const images: DeHubNFT[] = [];

  nfts.forEach((nft) => {
    if (nft.media_type === 'video' || nft.media_type === 'audio') {
      videos.push(nft);
    } else if (nft.media_type === 'image') {
      images.push(nft);
    }
  });

  return { videos, images, all: nfts };
}

// Re-export types for convenience
export type { SearchSuggestion, SearchLogParams };

/**
 * Hook for search autocomplete suggestions
 */
export function useSearchSuggestions(query: string, enabled = true) {
  const debouncedQuery = useDebouncedValue(query, 200);
  
  // Only fetch if query is at least 2 characters
  const shouldFetch = enabled && debouncedQuery.trim().length >= 2;

  return useQuery({
    queryKey: ['search-suggestions', debouncedQuery.trim()],
    queryFn: () => getSearchSuggestions({ 
      q: debouncedQuery.trim(),
      limit: 8,
    }),
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
}

/**
 * Hook for logging search analytics
 */
export function useSearchAnalytics() {
  return useMutation({
    mutationFn: logSearchAnalytics,
    // Fire and forget - no need to handle errors for analytics
    onError: (error) => {
      console.debug('Search analytics log failed:', error);
    },
  });
}
