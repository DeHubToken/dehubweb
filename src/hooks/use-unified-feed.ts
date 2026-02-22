/**
 * Unified Feed Hook
 * =================
 * Fetches mixed content (videos, images, text posts) from the unified /api/feed endpoint.
 * Uses server-side caching for instant loads on common requests.
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DEHUB_API_BASE = "https://api.dehub.io";

// Cache staleness threshold (10 minutes)
const CACHE_STALE_MS = 10 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedFeedParams {
  page?: number;
  limit?: number;
  sortBy?: 'views' | 'likes' | 'createdAt' | 'tips' | 'comments' | 'random';
  sortOrder?: 'asc' | 'desc';
  postType?: 'all' | 'video' | 'feed-images' | 'feed-simple' | 'live';
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
  imageUrls?: string[];  // Array of image paths for multi-image posts
  videoUrl?: string;
  minter: string;
  owner?: string;
  postType: 'video' | 'feed-images' | 'feed-simple' | 'live';
  status?: string;
  category?: string[];
  views: number;
  totalVotes?: {
    for: number;
    against: number;
  };
  likes?: number;       // Flat likes count (new API format)
  dislikes?: number;    // Flat dislikes count (new API format)
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

// ============================================================================
// BLOCKLIST
// ============================================================================

/** Hardcoded fallback usernames/display names to filter out from feeds */
const BLOCKED_CREATORS_FALLBACK = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

function isBlockedCreator(item: UnifiedFeedItem, dynamicBlockedAddresses?: Set<string>): boolean {
  // Check dynamic block list (addresses) first
  if (dynamicBlockedAddresses && dynamicBlockedAddresses.has(item.minter?.toLowerCase())) {
    return true;
  }
  // Fallback to hardcoded name-based list
  const displayName = (item.minterDisplayName || '').toLowerCase();
  const username = (item.minterUsername || '').toLowerCase();
  return BLOCKED_CREATORS_FALLBACK.some(blocked => 
    displayName.includes(blocked) || username.includes(blocked)
  );
}

function isBlockedPost(item: UnifiedFeedItem): boolean {
  return BLOCKED_POST_IDS.includes(item.tokenId);
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

  // For live/ended streams, VideoCard uses a native <video> which can't play HLS.
  // Skip videoUrl so VideoCard shows the thumbnail — clicking navigates to the
  // single post page which uses LiveStreamCard (with hls.js) for proper playback.
  const videoUrl = item.postType === 'live'
    ? undefined
    : (item.videoUrl?.startsWith('http') ? item.videoUrl : buildVideoUrl(item.tokenId));
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
    durationSeconds: item.videoDuration || 0,
    title: item.name || 'Untitled',
    description: item.description,
    channel: item.minterDisplayName || item.minterUsername || 'Unknown Creator',
    channelAvatar,
    verified: false,
    views: formatViews(item.views),
    uploadedAgo: formatTimeAgo(item.createdAt),
    status: item.status,
    creatorId: item.minter,
    creatorUsername: item.minterUsername,
    creatorBadgeBalance: item.minterUser?.badgeBalance,
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
    likeCount: item.likes ?? item.totalVotes?.for ?? 0,
    dislikeCount: item.dislikes ?? item.totalVotes?.against ?? 0,
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
    // Preserve raw timestamp for navigation caching
    createdAt: item.createdAt,
    isOwner: item.isOwner ?? false,
    isUnlocked: item.isUnlocked ?? false,
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
    likes: item.likes ?? item.totalVotes?.for ?? 0,
    caption: item.description || item.name || '',
    comments: item.commentCount || 0,
    views: formatViews(item.views).replace(' views', ''),
    timeAgo: formatTimeAgo(item.createdAt),
    status: item.status,
    creatorId: item.minter,
    creatorUsername: item.minterUsername,
    creatorBadgeBalance: item.minterUser?.badgeBalance,
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
    // Preserve raw timestamp for navigation caching
    createdAt: item.createdAt,
    // PPV/Bounty/Locked fields
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
      badgeBalance: item.minterUser?.badgeBalance,
    },
    content: item.description || item.name || '',
    // Store raw timestamp - PostMetadata handles formatting
    createdAt: item.createdAt,
    views: formatViews(item.views).replace(' views', ''),
    status: item.status,
    stats: {
      comments: item.commentCount || 0,
      reposts: 0,
      likes: item.likes ?? item.totalVotes?.for ?? 0,
    },
    isLiked: item.isLiked ?? false,
    isDisliked: item.isDisliked ?? false,
  };
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Determine the cache key for a given set of params
 * Now supports pages 1-5 for both latest and popular feeds
 */
function getCacheKey(params: UnifiedFeedParams): string | null {
  const page = params.page || 1;
  
  // Only cache pages 1-5
  if (page < 1 || page > 5) return null;
  if (params.minter) return null; // User-specific queries aren't cached
  if (params.isPPV || params.isLocked || params.hasBounty || params.hasPlans) return null;
  if (params.range || params.from || params.to) return null;
  
  const postType = params.postType || 'all';
  if (postType !== 'all') return null; // Only cache "all" feed for now
  
  const sortBy = params.sortBy || 'likes'; // Default sort is likes (popular)
  
  if (sortBy === 'createdAt') {
    return `feed_latest_page${page}`;
  } else if (sortBy === 'likes') {
    return `feed_popular_page${page}`;
  }
  
  return null;
}

/**
 * Fetch feed data from server-side cache
 */
async function fetchCachedFeed(cacheKey: string): Promise<UnifiedFeedResponse | null> {
  try {
    const { data, error } = await supabase
      .from("feed_cache")
      .select("data, updated_at")
      .eq("cache_key", cacheKey)
      .single();
    
    if (error || !data) {
      console.log(`Cache miss for ${cacheKey}:`, error?.message || 'No data');
      return null;
    }
    
    // Check if cache is stale
    const cacheAge = Date.now() - new Date(data.updated_at).getTime();
    if (cacheAge > CACHE_STALE_MS) {
      console.log(`Cache stale for ${cacheKey} (${Math.round(cacheAge / 1000 / 60)}min old)`);
      return null;
    }
    
    console.log(`Cache hit for ${cacheKey} (${Math.round(cacheAge / 1000)}s old)`);
    
    // Safely cast the JSONB data to our expected type
    const feedData = data.data as unknown as UnifiedFeedResponse;
    
    // Basic validation that the data has expected structure
    if (!feedData || typeof feedData !== 'object' || !Array.isArray(feedData.result)) {
      console.log(`Invalid cache data structure for ${cacheKey}`);
      return null;
    }
    
    return feedData;
  } catch (err) {
    console.error('Cache fetch error:', err);
    return null;
  }
}

// ============================================================================
// API CALL
// ============================================================================

async function fetchUnifiedFeedFromAPI(params: UnifiedFeedParams = {}): Promise<UnifiedFeedResponse> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  
  // Add query params
  if (params.page !== undefined) url.searchParams.set('page', String(params.page));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);
  if (params.postType && params.postType !== 'all') url.searchParams.set('postType', params.postType);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.minter) url.searchParams.set('minter', params.minter);
  // address param is deprecated - viewer context comes from JWT token
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

/**
 * Main fetch function with cache-first strategy
 */
async function fetchUnifiedFeed(params: UnifiedFeedParams = {}): Promise<UnifiedFeedResponse> {
  const token = getAuthToken();
  const page = params.page || 1;
  const cacheKey = getCacheKey(params);
  
  if (!token) {
    // Unauthenticated: cache-first
    if (cacheKey) {
      const cached = await fetchCachedFeed(cacheKey);
      if (cached) return cached;
    }
    return fetchUnifiedFeedFromAPI(params);
  }
  
  // Authenticated: race cache against API — cache can only help, never hurt
  if (cacheKey && page <= 5) {
    const cacheWithTimeout = fetchCachedFeed(cacheKey)
      .then(result => result || Promise.reject('empty'))
      .catch(() => new Promise<null>(r => setTimeout(() => r(null), 500)));
    const apiPromise = fetchUnifiedFeedFromAPI(params);
    
    // Race: whichever resolves first with data wins
    const result = await Promise.race([
      cacheWithTimeout.then(cached => {
        if (cached) {
          console.log(`[Feed] Cache won race for ${cacheKey}`);
          apiPromise.catch(() => {}); // swallow unhandled rejection
          return cached;
        }
        // Cache timed out — fall through to API
        return apiPromise;
      }),
      apiPromise.then(apiResult => {
        console.log(`[Feed] API won race for ${cacheKey}`);
        return apiResult;
      }),
    ]);
    
    return result;
  }
  
  // No cacheable key or page > 2: direct API call
  return fetchUnifiedFeedFromAPI(params);
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
  const { isAuthenticated, walletAddress } = useAuth();
  
  // Fetch dynamic block list for authenticated users
  const { data: blockList } = useQuery({
    queryKey: ['block-list'],
    queryFn: getBlockList,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // PPV purchase check removed — the DeHub API already provides isUnlocked per post,
  // and the payment flow in use-ppv-payment.ts checks ppv_purchases on-demand.

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
      
      const response = await fetchUnifiedFeed({
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
    // Stale-while-revalidate: show cached data immediately, refresh in background
    staleTime: 1000 * 60 * 5, // Data is "fresh" for 5 minutes (no refetch)
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour for instant back navigation
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnMount: false, // Don't refetch when component remounts
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: 2,
    // Show stale data while refetching in background (stale-while-revalidate pattern)
    placeholderData: (previousData) => previousData,
  });
}
