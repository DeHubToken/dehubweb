/**
 * DeHub Feed Hook
 * ================
 * Fetches content from the DeHub API and maps it to local feed types.
 * Provides loading states, pagination, and error handling.
 * 
 * @module hooks/use-dehub-feed
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { searchNFTs, type DeHubNFT, type SearchNFTsParams } from '@/lib/api/dehub';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

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
 */
export function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  return {
    id: nft.id || nft.token_id,
    type: 'video',
    thumbnail: nft.thumbnail_url || nft.media_url || FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length],
    duration: formatDuration(nft.duration),
    title: nft.title || 'Untitled',
    channel: nft.creator?.display_name || nft.creator?.username || 'Unknown Creator',
    channelAvatar: nft.creator?.avatar_url || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    views: formatViews(nft.view_count),
    uploadedAgo: formatTimeAgo(nft.created_at),
  };
}

/**
 * Map DeHub NFT to ImagePost type
 */
export function mapNFTToImagePost(nft: DeHubNFT, index: number): ImagePost {
  return {
    id: nft.id || nft.token_id,
    type: 'image',
    username: nft.creator?.username || 'unknown',
    verified: nft.creator?.is_verified || false,
    avatar: nft.creator?.avatar_url || nft.creator?.username || 'user',
    image: nft.media_url || nft.thumbnail_url || FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length],
    likes: nft.like_count || 0,
    caption: nft.description || nft.title || '',
    comments: nft.comment_count || 0,
    timeAgo: formatTimeAgo(nft.created_at),
  };
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
      const result = await searchNFTs({
        ...searchParams,
        page: pageParam,
        limit: searchParams.limit || 15,
      });
      return result;
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
