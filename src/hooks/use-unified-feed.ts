/**
 * Unified Feed Hook
 * =================
 * Fetches mixed content (videos, images, text posts) from the unified /api/feed endpoint.
 * All feed loads go directly to the DeHub API. TanStack Query handles client-side caching.
 * 
 * @module hooks/use-unified-feed
 */

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getAuthToken, DEHUB_CDN_BASE, type DeHubNFT, getBlockList } from '@/lib/api/dehub';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls, extractAvatarPath } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';
import { BLOCKED_POST_IDS } from '@/constants/post.constants';
import { useAuth } from '@/contexts/AuthContext';

const DEHUB_API_BASE = "https://api.dehub.io";

// ===========================================================================
// TYPES
// ===========================================================================

export interface UnifiedFeedParams {
  page?: number;
  limit?: number;
  sortBy?: 'views' | 'likes' | 'createdAt' | 'tips' | 'comments' | 'random';
  sortOrder?: 'asc' | 'desc';
  postType?: 'all' | 'video' | 'feed-images' | 'feed-simple' | 'live' | 'audio';
  status?: 'minted' | 'signed' | 'all' | 'pending' | 'failed';
  search?: string;
  owner?: string;
  category?: string;
  minter?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  address?: string;
  isPPV?: boolean;
  isLocked?: boolean;
  hasBounty?: boolean;
  hasPlans?: boolean;
  range?: 'day' | 'week' | 'month' | 'year';
  from?: string;
  to?: string;
  shuffleSeed?: string;
  maxPerCreator?: number;
  /** When true, only returns content from accounts the authenticated user follows. Requires JWT. */
  followingOnly?: boolean;
}

export interface UnifiedFeedItem {
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  minter: string;
  owner?: string;
  postType: 'video' | 'feed-images' | 'feed-simple' | 'live' | 'audio' | 'feed-audio';
  status?: string;
  category?: string[];
  views: number;
  totalVotes?: {
    for: number;
    against: number;
  };
  likes?: number;
  dislikes?: number;
  commentCount: number;
  videoDuration?: number;
  minterUsername?: string;
  /** Some API responses use 'mintername' instead of 'minterUsername' */
  mintername?: string;
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
  isDisliked?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  isUnlocked?: boolean;
  minterUser?: {
    address?: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    isVerified?: boolean;
    badgeBalance?: number;
  };
  minterFollowers?: number;
  minterFollowings?: number;
  stream?: {
    streamId?: string;
    playbackId?: string;
    streamKey?: string;
    status?: string;
    viewerCount?: number;
    title?: string;
    category?: string;
    playbackUrl?: string;
  };
  createdAt: string;
  updatedAt?: string;
  audioUrl?: string;
  audioDuration?: number;
  totalReposts?: number;
  reposts?: number;
  quotes?: number;
  ppvBuyerCount?: number;
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
  shuffleSeed?: string;
}

// ===========================================================================
// BLOCKLIST
// ===========================================================================

/** Hardcoded fallback usernames/display names to filter out from feeds */
const BLOCKED_CREATORS_FALLBACK = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

function isBlockedCreator(item: UnifiedFeedItem, dynamicBlockedAddresses?: Set<string>): boolean {
  if (dynamicBlockedAddresses && dynamicBlockedAddresses.has(item.minter?.toLowerCase())) {
    return true;
  }
  const displayName = (item.minterDisplayName || '').toLowerCase();
  const username = (item.minterUsername || '').toLowerCase();
  return BLOCKED_CREATORS_FALLBACK.some(blocked => 
    displayName.includes(blocked) || username.includes(blocked)
  );
}

function isBlockedPost(item: UnifiedFeedItem): boolean {
  return BLOCKED_POST_IDS.includes(item.tokenId);
}

// ===========================================================================
// MAPPERS
// ===========================================================================

/**
 * Map unified feed item to VideoItem
 */
export function mapToVideoItem(item: UnifiedFeedItem, index: number): VideoItem {
  const id = String(item.tokenId);
  
  const thumbnail = buildImageUrl(item.tokenId, item.imageUrl);

  const isAudioPost = item.postType === 'audio' || item.postType === 'feed-audio';
  const videoUrl = item.postType === 'live'
    ? undefined
    : isAudioPost
      ? undefined
      : (item.videoUrl?.startsWith('http') ? item.videoUrl : buildVideoUrl(item.tokenId));
  
  // Build audio URL from API audioUrl field
  const audioUrl = isAudioPost && item.audioUrl
    ? (item.audioUrl.startsWith('http') ? item.audioUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${item.audioUrl}`)
    : undefined;
  const rawAvatarPath = extractAvatarPath(item);
  const channelAvatar = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || 'user'
    : 'user';
  
  const isPPV = item.streamInfo?.isPayPerView ?? false;
  const isW2E = item.streamInfo?.isAddBounty ?? false;
  const isLocked = item.streamInfo?.isLockContent ?? false;
  
  return {
    id,
    type: 'video',
    thumbnail,
    videoUrl,
    audioUrl,
    audioDuration: isAudioPost ? item.audioDuration : undefined,
    isAudio: isAudioPost,
    duration: formatDuration(isAudioPost ? item.audioDuration : item.videoDuration),
    durationSeconds: (isAudioPost ? item.audioDuration : item.videoDuration) || 0,
    title: item.name || 'Untitled',
    description: item.description,
    channel: item.minterDisplayName || item.minterUsername || item.mintername || 'Unknown Creator',
    channelAvatar,
    verified: false,
    views: formatViews(item.views),
    uploadedAgo: formatTimeAgo(item.createdAt),
    status: item.status,
    creatorId: item.minter,
    creatorUsername: item.minterUsername || item.mintername,
    creatorBadgeBalance: item.minterUser?.badgeBalance,
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
    likeCount: item.likes ?? item.totalVotes?.for ?? 0,
    dislikeCount: item.dislikes ?? item.totalVotes?.against ?? 0,
    commentCount: item.commentCount || 0,
    ppvBuyerCount: item.ppvBuyerCount || 0,
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
    createdAt: item.createdAt,
    isOwner: item.isOwner ?? false,
    isUnlocked: item.isUnlocked ?? false,
    repostCount: (item.totalReposts || item.reposts || 0) + (item.quotes || 0),
  };
}

/**
 * Map unified feed item to ImagePost
 */
export function mapToImagePost(item: UnifiedFeedItem, index: number): ImagePost {
  const id = String(item.tokenId);
  
  const imageUrls = buildFeedImageUrls(item.imageUrls);
  const image = imageUrls?.[0] || buildImageUrl(item.tokenId, item.imageUrl);
  
  const rawAvatarPath = extractAvatarPath(item);
  const avatar = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || 'user'
    : 'user';
  
  return {
    id,
    type: 'image',
    username: item.minterUsername || item.mintername || item.minterDisplayName || 'unknown',
    verified: false,
    avatar,
    image,
    imageUrls,
    title: item.name,
    description: item.description,
    likes: item.likes ?? item.totalVotes?.for ?? 0,
    caption: item.description || item.name || '',
    comments: item.commentCount || 0,
    views: formatViews(item.views).replace(' views', ''),
    timeAgo: formatTimeAgo(item.createdAt),
    status: item.status,
    creatorId: item.minter,
    creatorUsername: item.minterUsername || item.mintername,
    creatorBadgeBalance: item.minterUser?.badgeBalance,
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
    ppvBuyerCount: item.ppvBuyerCount || 0,
    createdAt: item.createdAt,
    isPPV: item.streamInfo?.isPayPerView ?? false,
    ppvPrice: item.streamInfo?.payPerViewAmount,
    ppvCurrency: 'DHB',
    isW2E: item.streamInfo?.isAddBounty ?? false,
    isLocked: item.streamInfo?.isLockContent ?? false,
    lockedPrice: item.streamInfo?.lockContentAmount,
    lockedCurrency: item.streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews: Number(item.streamInfo?.addBountyFirstXViewers) || undefined,
    bountyComments: Number(item.streamInfo?.addBountyFirstXComments) || undefined,
    bountyAmount: item.streamInfo?.addBountyAmount,
    bountyCurrency: item.streamInfo?.addBountyTokenSymbol || 'DHB',
    isOwner: item.isOwner ?? false,
    isUnlocked: item.isUnlocked ?? false,
    repostCount: (item.totalReposts || item.reposts || 0) + (item.quotes || 0),
  };
}

/**
 * Map unified feed item to TextPost
 */
export function mapToTextPost(item: UnifiedFeedItem, index: number): TextPost {
  const id = String(item.tokenId);
  
  const rawAvatarPath = extractAvatarPath(item);
  const avatarUrl = rawAvatarPath 
    ? buildAvatarUrl(item.minter, rawAvatarPath) || item.minter
    : item.minter;
  
  return {
    id,
    type: 'post',
    author: {
      id: item.minter,
      name: item.minterDisplayName || item.minterUsername || item.mintername || 'Unknown',
      handle: item.minterUsername || item.mintername || item.minter,
      avatarSeed: avatarUrl,
      verified: false,
      badgeBalance: item.minterUser?.badgeBalance,
    },
    content: item.description || item.name || '',
    createdAt: item.createdAt,
    views: formatViews(item.views).replace(' views', ''),
    status: item.status,
    stats: {
      comments: item.commentCount || 0,
      reposts: (item.totalReposts || item.reposts || 0) + (item.quotes || 0),
      likes: item.likes ?? item.totalVotes?.for ?? 0,
    },
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
    isQuotePost: !!(item as any).isQuotePost,
    quotedPost: (item as any).quotedPost || null,
  };
}

// ===========================================================================
// API CALL
// ===========================================================================

async function fetchUnifiedFeedFromAPI(params: UnifiedFeedParams = {}): Promise<UnifiedFeedResponse> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  
  if (params.page !== undefined) url.searchParams.set('page', String(params.page));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);
  if (params.postType && params.postType !== 'all') url.searchParams.set('postType', params.postType);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.minter) url.searchParams.set('minter', params.minter);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.owner) url.searchParams.set('owner', params.owner);
  if (params.category) url.searchParams.set('category', params.category);
  if (params.isPPV !== undefined) url.searchParams.set('isPPV', String(params.isPPV));
  if (params.isLocked !== undefined) url.searchParams.set('isLocked', String(params.isLocked));
  if (params.hasBounty !== undefined) url.searchParams.set('hasBounty', String(params.hasBounty));
  if (params.hasPlans !== undefined) url.searchParams.set('hasPlans', String(params.hasPlans));
  if (params.range) url.searchParams.set('range', params.range);
  if (params.from) url.searchParams.set('from', params.from);
  if (params.to) url.searchParams.set('to', params.to);
  if (params.shuffleSeed) url.searchParams.set('shuffleSeed', params.shuffleSeed);
  if (params.maxPerCreator !== undefined) url.searchParams.set('maxPerCreator', String(params.maxPerCreator));
  if (params.followingOnly) url.searchParams.set('followingOnly', 'true');
  
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

// ===========================================================================
// HOOK
// ===========================================================================

interface UseUnifiedFeedOptions extends Omit<UnifiedFeedParams, 'page'> {
  enabled?: boolean;
}

/**
 * Hook to fetch unified feed with infinite scroll
 */
export function useUnifiedFeed(options: UseUnifiedFeedOptions = {}) {
  const { enabled = true, limit = 20, ...params } = options;
  const { isAuthenticated, walletAddress } = useAuth();
  
  // Fetch dynamic block list for authenticated users
  const { data: blockList } = useQuery({
    queryKey: ['block-list'],
    queryFn: getBlockList,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const blockedAddresses = useMemo(() => {
    if (!blockList?.length) return undefined;
    return new Set(blockList.map(u => u.address.toLowerCase()));
  }, [blockList]);
  
  // Track shuffleSeed across pages for random sort stable pagination
  const shuffleSeedRef = { current: '' };
  
  return useInfiniteQuery({
    queryKey: ['unified-feed', params, limit],
    queryFn: async ({ pageParam = 1 }) => {
      // For random sort: reuse the seed from the first page response for stable pagination
      const queryParams = { ...params };
      if (params.sortBy === 'random' && pageParam > 1 && shuffleSeedRef.current) {
        queryParams.shuffleSeed = shuffleSeedRef.current;
      }
      
      const response = await fetchUnifiedFeedFromAPI({
        ...queryParams,
        page: pageParam,
        limit,
      });
      
      // Store the shuffleSeed from the first page for subsequent pages
      if (params.sortBy === 'random' && response.shuffleSeed && pageParam === 1) {
        shuffleSeedRef.current = response.shuffleSeed;
      }
      
      // Filter out blocked creators and ended live streams (live content is shown in the carousel instead)
      let filteredItems = (response.result || []).filter(item => 
        !isBlockedCreator(item, blockedAddresses) && !isBlockedPost(item) && item.postType !== 'live'
      );
      
      return {
        items: filteredItems,
        pagination: response.pagination,
        page: pageParam,
        shuffleSeed: response.shuffleSeed,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination?.hasMore === true) {
        return lastPage.page + 1;
      }
      if (lastPage.pagination?.hasMore === false) {
        return undefined;
      }
      const itemCount = lastPage.items?.length || 0;
      return itemCount >= limit ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    retry: 2,
    placeholderData: (previousData) => previousData,
  });
}
