/**
 * Unified Feed Hook
 * =================
 * Fetches mixed content (videos, images, text posts) from the unified /api/feed endpoint.
 * This is the recommended endpoint for the home feed.
 * 
 * @module hooks/use-unified-feed
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getAuthToken, getMediaUrl, DEHUB_CDN_BASE, type DeHubNFT } from '@/lib/api/dehub';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

const DEHUB_API_BASE = "https://api.dehub.io";

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedFeedParams {
  page?: number;
  limit?: number;
  sortBy?: 'views' | 'likes' | 'createdAt' | 'tips' | 'comments';
  sortOrder?: 'asc' | 'desc';
  postType?: 'all' | 'video' | 'feed-images' | 'feed-simple';
  minter?: string;
  address?: string;
  isPPV?: boolean;
  isLocked?: boolean;
  hasBounty?: boolean;
  hasPlans?: boolean;
  range?: 'day' | 'week' | 'month' | 'year';
  from?: string;
  to?: string;
}

export interface UnifiedFeedItem {
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  imageUrls?: string[];  // Array of image paths for multi-image posts
  videoUrl?: string;
  minter: string;
  owner?: string;
  postType: 'video' | 'feed-images' | 'feed-simple';
  status?: string;
  category?: string[];
  views: number;
  totalVotes?: {
    for: number;
    against: number;
  };
  commentCount: number;
  videoDuration?: number;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  minterAboutMe?: string;
  minterStaked?: number;
  streamInfo?: {
    isLockContent: boolean;
    lockAmount?: number;
    isPayPerView: boolean;
    payPerViewAmount?: number;
    isAddBounty: boolean;
  };
  plansDetails?: Array<{
    id: number;
    title: string;
    price: number;
    alreadySubscribed?: boolean;
  }>;
  isLiked?: boolean;
  isSaved?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface UnifiedFeedResponse {
  status: boolean;
  result: UnifiedFeedItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

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

function formatViews(count?: number): string {
  if (!count) return '0 views';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
  return `${count} views`;
}

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

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Map unified feed item to VideoItem
 */
/**
 * Extract file extension from API path
 * Converts .octet-stream to .jpg for better browser compatibility
 */
function getExtension(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9-]+)$/);
  if (!match) return 'jpg';
  const ext = match[1].toLowerCase();
  // Convert octet-stream to jpg
  return ext === 'octet-stream' ? 'jpg' : ext;
}

/**
 * Build canonical image URL: cdn/images/{tokenId}.{ext}
 * API returns paths like "images/2008.jpg" or "nfts/images/61.jpeg"
 * We normalize to: https://dehubcdn.../images/{tokenId}.{ext}
 */
function buildImageUrl(tokenId: number, apiImagePath: string | undefined): string {
  if (!apiImagePath) return '';
  if (apiImagePath.startsWith('http')) return apiImagePath;
  const ext = getExtension(apiImagePath);
  return `${DEHUB_CDN_BASE}images/${tokenId}.${ext}`;
}

/**
 * Build canonical avatar URL: cdn/avatars/{address}.{ext}
 * API returns paths like "avatars/xxx.jpg" or "statics/avatars/xxx.octet-stream"
 * We normalize to: https://dehubcdn.../avatars/{address}.{ext}
 */
function buildAvatarUrl(address: string, apiAvatarPath: string | undefined): string {
  if (!apiAvatarPath) return '';
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  const ext = getExtension(apiAvatarPath);
  return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
}

/**
 * Build video URL: cdn/videos/{tokenId}.mp4
 */
function buildVideoUrl(tokenId: number): string {
  return `${DEHUB_CDN_BASE}videos/${tokenId}.mp4`;
}

/**
 * Map unified feed item to VideoItem
 */
export function mapToVideoItem(item: UnifiedFeedItem, index: number): VideoItem {
  const id = String(item.tokenId);
  
  // Build canonical URLs: cdn/images/{tokenId}.{ext} and cdn/avatars/{address}.{ext}
  const thumbnail = buildImageUrl(item.tokenId, item.imageUrl);
  const videoUrl = buildVideoUrl(item.tokenId);
  const channelAvatar = item.minterAvatarUrl 
    ? buildAvatarUrl(item.minter, item.minterAvatarUrl) 
    : 'user';
  
  // Determine PPV/W2E/Locked status from streamInfo
  const isPPV = item.streamInfo?.isPayPerView ?? false;
  const isW2E = item.streamInfo?.isAddBounty ?? false;
  const isLocked = item.streamInfo?.isLockContent ?? false;
  
  return {
    id,
    type: 'video',
    thumbnail,
    videoUrl,
    duration: formatDuration(item.videoDuration),
    title: item.name || 'Untitled',
    channel: item.minterDisplayName || item.minterUsername || 'Unknown Creator',
    channelAvatar,
    verified: false,
    views: formatViews(item.views),
    uploadedAgo: formatTimeAgo(item.createdAt),
    creatorId: item.minter,
    creatorUsername: item.minterUsername,
    isLiked: item.isLiked ?? false,
    likeCount: item.totalVotes?.for || 0,
    dislikeCount: item.totalVotes?.against || 0,
    commentCount: item.commentCount || 0,
    isPPV,
    ppvPrice: item.streamInfo?.payPerViewAmount,
    ppvCurrency: 'DHB',
    isW2E,
    isLocked,
  };
}

/**
 * Build multi-image URLs: cdn/feed-images/{filename}
 * API returns array like ["feed-images/abc.jpg", "feed-images/def.png"]
 * We extract filename and build: https://dehubcdn.../feed-images/{filename}
 */
function buildImageUrls(apiImageUrls: string[] | undefined): string[] | undefined {
  if (!apiImageUrls || apiImageUrls.length === 0) return undefined;
  
  return apiImageUrls.map((imgUrl) => {
    if (imgUrl.startsWith('http')) return imgUrl;
    const filename = imgUrl.split('/').pop() || '';
    if (filename) {
      return `${DEHUB_CDN_BASE}feed-images/${filename}`;
    }
    return imgUrl;
  });
}

/**
 * Map unified feed item to ImagePost
 */
export function mapToImagePost(item: UnifiedFeedItem, index: number): ImagePost {
  const id = String(item.tokenId);
  
  // Build multi-image URLs if available
  const imageUrls = buildImageUrls(item.imageUrls);
  
  // Primary image: first from imageUrls array, or fallback to single imageUrl
  const image = imageUrls?.[0] || buildImageUrl(item.tokenId, item.imageUrl);
  
  // Build avatar URL
  const avatar = item.minterAvatarUrl 
    ? buildAvatarUrl(item.minter, item.minterAvatarUrl) 
    : 'user';
  
  return {
    id,
    type: 'image',
    username: item.minterUsername || item.minterDisplayName || 'unknown',
    verified: false,
    avatar,
    image,
    imageUrls,
    title: item.name,
    description: item.description,
    likes: item.totalVotes?.for || 0,
    caption: item.description || item.name || '',
    comments: item.commentCount || 0,
    views: formatViews(item.views).replace(' views', ''),
    timeAgo: formatTimeAgo(item.createdAt),
    creatorId: item.minter,
    creatorUsername: item.minterUsername,
    isLiked: item.isLiked ?? false,
  };
}

/**
 * Map unified feed item to TextPost
 */
export function mapToTextPost(item: UnifiedFeedItem, index: number): TextPost {
  const id = String(item.tokenId);
  
  // Build canonical avatar URL: cdn/avatars/{address}.{ext}
  const avatarUrl = item.minterAvatarUrl 
    ? buildAvatarUrl(item.minter, item.minterAvatarUrl) 
    : item.minter;
  
  return {
    id,
    type: 'post',
    author: {
      id: item.minter,
      name: item.minterDisplayName || item.minterUsername || 'Unknown',
      handle: item.minterUsername || item.minter,
      avatarSeed: avatarUrl,
      verified: false,
    },
    content: item.description || item.name || '',
    createdAt: formatTimeAgo(item.createdAt),
    stats: {
      comments: item.commentCount || 0,
      reposts: 0,
      likes: item.totalVotes?.for || 0,
    },
  };
}

// ============================================================================
// API CALL
// ============================================================================

async function fetchUnifiedFeed(params: UnifiedFeedParams = {}): Promise<UnifiedFeedResponse> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  
  // Add query params
  if (params.page !== undefined) url.searchParams.set('page', String(params.page));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);
  if (params.postType && params.postType !== 'all') url.searchParams.set('postType', params.postType);
  if (params.minter) url.searchParams.set('minter', params.minter);
  if (params.address) url.searchParams.set('address', params.address);
  if (params.isPPV !== undefined) url.searchParams.set('isPPV', String(params.isPPV));
  if (params.isLocked !== undefined) url.searchParams.set('isLocked', String(params.isLocked));
  if (params.hasBounty !== undefined) url.searchParams.set('hasBounty', String(params.hasBounty));
  if (params.hasPlans !== undefined) url.searchParams.set('hasPlans', String(params.hasPlans));
  if (params.range) url.searchParams.set('range', params.range);
  if (params.from) url.searchParams.set('from', params.from);
  if (params.to) url.searchParams.set('to', params.to);
  
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url.toString(), { headers });
  
  if (!response.ok) {
    throw new Error(`Feed API error: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// HOOK
// ============================================================================

interface UseUnifiedFeedOptions extends Omit<UnifiedFeedParams, 'page'> {
  enabled?: boolean;
}

/**
 * Hook to fetch unified feed with infinite scroll
 */
export function useUnifiedFeed(options: UseUnifiedFeedOptions = {}) {
  const { enabled = true, limit = 20, ...params } = options;
  
  return useInfiniteQuery({
    queryKey: ['unified-feed', params, limit],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetchUnifiedFeed({
        ...params,
        page: pageParam,
        limit,
      });
      
      return {
        items: response.result || [],
        pagination: response.pagination,
        page: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination?.hasMore) {
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
