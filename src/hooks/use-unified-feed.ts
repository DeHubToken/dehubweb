/**
 * Unified Feed Hook
 * =================
 * Fetches mixed content (videos, images, text posts) from the unified /api/feed endpoint.
 * This is the recommended endpoint for the home feed.
 * 
 * @module hooks/use-unified-feed
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getAuthToken, DEHUB_CDN_BASE, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls, extractAvatarPath } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
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
  status?: 'minted' | 'pending' | 'failed';
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
    lockContentAmount?: number;
    lockContentTokenSymbol?: string;
    isPayPerView: boolean;
    payPerViewAmount?: number;
    isAddBounty: boolean;
    addBountyFirstXViewers?: number | string;
    addBountyFirstXComments?: number | string;
    addBountyAmount?: number;
    addBountyTokenSymbol?: string;
    addBountyChainId?: number;
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
// BLOCKLIST
// ============================================================================

/** Usernames/display names to filter out from feeds */
const BLOCKED_CREATORS = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

function isBlockedCreator(item: UnifiedFeedItem): boolean {
  const displayName = (item.minterDisplayName || '').toLowerCase();
  const username = (item.minterUsername || '').toLowerCase();
  return BLOCKED_CREATORS.some(blocked => 
    displayName.includes(blocked) || username.includes(blocked)
  );
}

// Helper functions (formatDuration, formatViews, formatTimeAgo) are now imported from @/lib/feed-utils

// ============================================================================
// MAPPERS
// ============================================================================

/**
 * Map unified feed item to VideoItem
 */
export function mapToVideoItem(item: UnifiedFeedItem, index: number): VideoItem {
  const id = String(item.tokenId);
  
  // Build canonical URLs using shared utilities
  const thumbnail = buildImageUrl(item.tokenId, item.imageUrl);
  const videoUrl = buildVideoUrl(item.tokenId);
  const rawAvatarPath = extractAvatarPath(item);
  const channelAvatar = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || 'user'
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
    lockedPrice: item.streamInfo?.lockContentAmount,
    lockedCurrency: item.streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews: Number(item.streamInfo?.addBountyFirstXViewers) || undefined,
    bountyComments: Number(item.streamInfo?.addBountyFirstXComments) || undefined,
    bountyAmount: item.streamInfo?.addBountyAmount,
    bountyCurrency: item.streamInfo?.addBountyTokenSymbol || 'DHB',
  };
}

/**
 * Map unified feed item to ImagePost
 */
export function mapToImagePost(item: UnifiedFeedItem, index: number): ImagePost {
  const id = String(item.tokenId);
  
  // Build multi-image URLs using shared utility
  const imageUrls = buildFeedImageUrls(item.imageUrls);
  
  // Primary image: first from imageUrls array, or fallback to single imageUrl
  const image = imageUrls?.[0] || buildImageUrl(item.tokenId, item.imageUrl);
  
  // Build avatar URL using shared utility
  const rawAvatarPath = extractAvatarPath(item);
  const avatar = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || 'user'
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
  
  // Build canonical avatar URL using shared utility
  const rawAvatarPath = extractAvatarPath(item);
  const avatarUrl = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || item.minter
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
    views: formatViews(item.views).replace(' views', ''),
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
  if (params.status) url.searchParams.set('status', params.status);
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
      
      // Filter out blocked creators
      const filteredItems = (response.result || []).filter(item => !isBlockedCreator(item));
      
      return {
        items: filteredItems,
        pagination: response.pagination,
        page: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      // Strictly use pagination.hasMore if available
      if (lastPage.pagination?.hasMore === true) {
        return lastPage.page + 1;
      }
      if (lastPage.pagination?.hasMore === false) {
        return undefined;
      }
      // Fallback only if pagination info is completely missing
      // AND we got a full page of items
      const itemCount = lastPage.items?.length || 0;
      return itemCount >= limit ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}
