/**
 * DeHub Feed Hook
 * ================
 * Fetches content from the DeHub API and maps it to local feed types.
 * Provides loading states, pagination, and error handling.
 * 
 * @module hooks/use-dehub-feed
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchNFTs, getMediaUrl, type DeHubNFT, type SearchNFTsParams } from '@/lib/api/dehub';
import type { VideoItem, ImagePost, LiveStream } from '@/types/feed.types';

// Fallback thumbnails for when API doesn't return one
const FALLBACK_THUMBNAILS = [
  'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=480&h=270&fit=crop',
];

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format view count to human readable string
 */
function formatViews(count?: number): string {
  if (!count) return '0 views';
  
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}

/**
 * Format time ago from ISO date string
 */
function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

/**
 * Map DeHub NFT to VideoItem type
 * Handles both old and new API response field names
 */
export function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  // Get ID from various possible fields
  const id = String(nft.tokenId || nft.id || nft.token_id);
  
  // Get thumbnail with CDN URL
  const thumbnail = getMediaUrl(nft.imageUrl) || 
                    getMediaUrl(nft.thumbnail_url) || 
                    getMediaUrl(nft.media_url) || 
                    FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];
  
  // Get video URL with CDN
  const videoUrl = getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url);
  
  // Get duration from various fields
  const duration = nft.videoDuration || nft.duration;
  
  // Get creator info from various possible fields
  const channel = nft.minterDisplayName || 
                  nft.mintername || 
                  nft.creator?.display_name || 
                  nft.creator?.username || 
                  'Unknown Creator';
  
  const channelAvatar = getMediaUrl(nft.minterAvatarUrl) || 
                        getMediaUrl(nft.creator?.avatar_url) || 
                        'user';
  
  const verified = nft.creator?.is_verified || false;
  
  // Get view count from various fields
  const viewCount = nft.views || nft.view_count;
  
  // Get created date from various fields
  const createdAt = nft.createdAt || nft.created_at;
  
  return {
    id,
    type: 'video',
    thumbnail,
    videoUrl,
    duration: formatDuration(duration),
    title: nft.name || nft.title || 'Untitled',
    channel,
    channelAvatar,
    verified,
    views: formatViews(viewCount),
    uploadedAgo: formatTimeAgo(createdAt),
  };
}

/**
 * Map DeHub NFT to ImagePost type
 * Handles both old and new API response field names
 */
export function mapNFTToImagePost(nft: DeHubNFT, index: number): ImagePost {
  // Get ID from various possible fields
  const id = String(nft.tokenId || nft.id || nft.token_id);
  
  // Get image URL with CDN
  const image = getMediaUrl(nft.imageUrl) || 
                getMediaUrl(nft.media_url) || 
                getMediaUrl(nft.thumbnail_url) || 
                FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];
  
  // Get creator info
  const username = nft.mintername || nft.creator?.username || 'unknown';
  const avatar = getMediaUrl(nft.minterAvatarUrl) || 
                 getMediaUrl(nft.creator?.avatar_url) || 
                 'user';
  const verified = nft.creator?.is_verified || false;
  
  // Get stats
  const likes = nft.totalVotes?.for || nft.like_count || 0;
  const comments = nft.commentCount || nft.comment_count || 0;
  
  // Get created date
  const createdAt = nft.createdAt || nft.created_at;
  
  return {
    id,
    type: 'image',
    username,
    verified,
    avatar,
    image,
    likes,
    caption: nft.description || nft.name || nft.title || '',
    comments,
    timeAgo: formatTimeAgo(createdAt),
  };
}

/**
 * Map DeHub NFT to LiveStream type
 * Handles live content from the API
 */
export function mapNFTToLiveStream(nft: DeHubNFT, index: number): LiveStream {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  
  const thumbnail = getMediaUrl(nft.imageUrl) || 
                    getMediaUrl(nft.thumbnail_url) || 
                    getMediaUrl(nft.media_url) || 
                    FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];
  
  const streamer = nft.minterDisplayName || 
                   nft.mintername || 
                   nft.creator?.display_name || 
                   nft.creator?.username || 
                   'Unknown Streamer';
  
  const avatar = getMediaUrl(nft.minterAvatarUrl) || 
                 getMediaUrl(nft.creator?.avatar_url) || 
                 'user';
  
  const viewCount = nft.views || nft.view_count || 0;
  const category = Array.isArray(nft.category) ? nft.category[0] : nft.category;
  
  return {
    id,
    type: 'live',
    streamer,
    avatar,
    title: nft.name || nft.title || 'Live Stream',
    game: category || 'Just Chatting',
    viewers: formatViews(viewCount).replace(' views', ''),
    thumbnail,
    tags: nft.tags || [],
    isLive: nft.is_live ?? true,
  };
}

/**
 * Map DeHub NFT creator to story user format
 */
export function mapNFTToStoryUser(nft: DeHubNFT): { name: string; avatar: string } {
  const name = nft.minterDisplayName || 
               nft.mintername || 
               nft.creator?.display_name || 
               nft.creator?.username || 
               'User';
  
  const avatar = getMediaUrl(nft.minterAvatarUrl) || 
                 getMediaUrl(nft.creator?.avatar_url) || 
                 '';
  
  return { name, avatar };
}

interface UseDeHubFeedOptions extends SearchNFTsParams {
  enabled?: boolean;
}

/**
 * Hook to fetch paginated DeHub feed content
 */
export function useDeHubFeed(options: UseDeHubFeedOptions = {}) {
  const { enabled = true, ...searchParams } = options;
  
  return useInfiniteQuery({
    queryKey: ['dehub-feed', searchParams],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await searchNFTs({
        ...searchParams,
        page: pageParam,
        limit: searchParams.limit || 15,
      });
      
      // Handle both response formats: { result: [...] } or { data: [...] }
      const data = (response as any).result || response.data || [];
      const limit = searchParams.limit || 15;
      
      return {
        data,
        page: pageParam,
        has_more: data.length >= limit,
        total: response.total || data.length,
        limit,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}

/**
 * Hook to fetch video content specifically
 */
export function useDeHubVideos(options: Omit<UseDeHubFeedOptions, 'media_type'> = {}) {
  return useDeHubFeed({
    ...options,
    media_type: 'video',
  });
}

/**
 * Hook to fetch image content specifically
 */
export function useDeHubImages(options: Omit<UseDeHubFeedOptions, 'media_type'> = {}) {
  return useDeHubFeed({
    ...options,
    media_type: 'image',
  });
}

/**
 * Hook to fetch live content specifically
 */
export function useDeHubLive(options: Omit<UseDeHubFeedOptions, 'media_type'> = {}) {
  return useDeHubFeed({
    ...options,
    media_type: 'live',
  });
}

/**
 * Hook to fetch unique story users from recent content
 */
export function useDeHubStoryUsers(limit: number = 10) {
  const { data, isLoading } = useDeHubFeed({ 
    limit: 30, // Fetch more to get unique creators
    sort: 'latest',
  });
  
  const storyUsers = useMemo(() => {
    if (!data?.pages) return [];
    
    const allNFTs = data.pages.flatMap(page => page.data || []);
    const seenCreators = new Set<string>();
    const users: { name: string; avatar: string }[] = [];
    
    for (const nft of allNFTs) {
      const creatorId = nft.minter || nft.creator?.id || '';
      if (creatorId && !seenCreators.has(creatorId)) {
        seenCreators.add(creatorId);
        users.push(mapNFTToStoryUser(nft));
        if (users.length >= limit) break;
      }
    }
    
    return users;
  }, [data, limit]);
  
  return { storyUsers, isLoading };
}
