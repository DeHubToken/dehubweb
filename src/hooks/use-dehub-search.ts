/**
 * DeHub Search Hook
 * ==================
 * Provides search functionality using the DeHub searchNFTs API.
 * Includes debouncing, pagination, and content type filtering.
 * 
 * @module hooks/use-dehub-search
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { searchNFTs, getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { useDebouncedValue } from './use-debounced-value';
import { mapNFTToVideoItem, mapNFTToImagePost } from './use-dehub-feed';
import type { VideoItem, ImagePost } from '@/types/feed.types';

export interface SearchCreator {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  verified: boolean;
  bio?: string;
}

export interface UseDeHubSearchOptions {
  /** Search query text */
  query: string;
  /** Content type filter: "video" | "feed-images" | "audio" | undefined */
  postType?: string;
  /** Category filter (lowercase) */
  category?: string;
  /** Sort mode */
  sortMode?: 'new' | 'popular' | 'trending';
  /** Whether the search is enabled */
  enabled?: boolean;
  /** User wallet address for like/dislike state */
  address?: string;
  /** Items per page */
  limit?: number;
}

/**
 * Map tab name to API postType parameter
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
 * Extract unique creators from NFT results
 */
export function extractUniqueCreators(nfts: DeHubNFT[]): SearchCreator[] {
  const creatorMap = new Map<string, SearchCreator>();

  if (!Array.isArray(nfts)) return [];

  nfts.forEach((nft) => {
    // Skip if no nft or minter info available
    if (!nft || !nft.minter) return;
    
    const minterId = nft.minter;
    if (creatorMap.has(minterId)) return;

    creatorMap.set(minterId, {
      id: minterId,
      name: nft.minterDisplayName || nft.mintername || 'User',
      handle: `@${nft.mintername || minterId.slice(0, 8)}`,
      avatar: nft.minterAvatarUrl ? getMediaUrl(nft.minterAvatarUrl) : undefined,
      verified: false, // API doesn't return verification on NFT objects
      bio: undefined,
    });
  });

  return Array.from(creatorMap.values()).filter(creator => creator.id);
}

/**
 * Map NFTs to appropriate content types based on media_type
 */
export function mapNFTsToContent(nfts: DeHubNFT[]): {
  videos: VideoItem[];
  images: ImagePost[];
  all: DeHubNFT[];
} {
  const videos: VideoItem[] = [];
  const images: ImagePost[] = [];

  nfts.forEach((nft, index) => {
    if (nft.media_type === 'video' || nft.media_type === 'audio') {
      videos.push(mapNFTToVideoItem(nft, index));
    } else if (nft.media_type === 'image') {
      images.push(mapNFTToImagePost(nft, index));
    }
  });

  return { videos, images, all: nfts };
}

/**
 * Hook to search DeHub content with debouncing and pagination
 */
export function useDeHubSearch({
  query,
  postType,
  category,
  sortMode = 'new',
  enabled = true,
  address,
  limit = 15,
}: UseDeHubSearchOptions) {
  // Debounce the query to prevent excessive API calls
  const debouncedQuery = useDebouncedValue(query, 300);

  // Only enable if query is at least 3 characters
  const shouldFetch = enabled && debouncedQuery.trim().length >= 3;

  return useInfiniteQuery({
    queryKey: ['dehub-search', debouncedQuery.trim(), postType, category, sortMode],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await searchNFTs({
        search: debouncedQuery.trim(),
        postType,
        category,
        sortMode,
        page: pageParam,
        unit: limit,
        address,
      });

      return {
        data: result.data,
        page: pageParam,
        hasMore: result.has_more,
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
 * Utility to get all items from paginated search results
 */
export function flattenSearchResults(data: { pages: Array<{ data: DeHubNFT[] }> } | undefined): DeHubNFT[] {
  if (!data?.pages) return [];
  return data.pages.flatMap((page) => page.data || []).filter(Boolean);
}
