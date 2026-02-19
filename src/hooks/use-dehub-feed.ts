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
import {
  searchNFTs,
  getMediaUrl,
  DEHUB_CDN_BASE,
  getLiveStreams,
  type DeHubNFT,
  type SearchNFTsParams,
  type LiveStream as ApiLiveStream,
} from '@/lib/api/dehub';
import { buildAvatarUrl, buildFeedImageUrls, buildVideoUrl } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, LiveStream } from '@/types/feed.types';
import { BLOCKED_POST_IDS } from '@/constants/post.constants';

// Fallback thumbnails for when API doesn't return one
const FALLBACK_THUMBNAILS = [
  'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=480&h=270&fit=crop',
  'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=480&h=270&fit=crop',
];

/** Usernames/display names to filter out from feeds */
const BLOCKED_CREATORS = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

function isBlockedCreator(nft: DeHubNFT): boolean {
  const displayName = (nft.minterDisplayName || nft.mintername || '').toLowerCase();
  const username = (nft.creator?.username || '').toLowerCase();
  return BLOCKED_CREATORS.some(blocked =>
    displayName.includes(blocked) || username.includes(blocked)
  );
}

function isBlockedPost(nft: DeHubNFT): boolean {
  const tokenId = nft.tokenId || nft.id || nft.token_id;
  const numericId = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
  return BLOCKED_POST_IDS.includes(numericId);
}

// Helper functions (formatDuration, formatViews, formatTimeAgo) are now imported from @/lib/feed-utils

/**
 * Helper function to detect content type from API response
 */
export function getContentType(nft: DeHubNFT): 'video' | 'image' | 'audio' {
  // Check postType first (primary field from API)
  if (nft.postType === 'image' || nft.postType === 'video' || nft.postType === 'audio') {
    return nft.postType;
  }
  // Fallback to media_type if present
  if (nft.media_type === 'image' || nft.media_type === 'video' || nft.media_type === 'audio') {
    return nft.media_type;
  }
  // Detect by URL patterns - if has video URL, it's video
  if (nft.videoUrl && nft.videoUrl.length > 0) return 'video';
  if (nft.imageUrl && !nft.videoUrl) return 'image';
  return 'video'; // Default
}

/**
 * Map DeHub NFT to VideoItem type
 * Handles both old and new API response field names
 */
export function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  // Get ID from various possible fields
  const tokenId = nft.tokenId || nft.id || nft.token_id;
  const id = String(tokenId);

  // Get thumbnail with CDN URL
  const thumbnail = getMediaUrl(nft.imageUrl) ||
    getMediaUrl(nft.thumbnail_url) ||
    getMediaUrl(nft.media_url) ||
    FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];

  // Build video URL (prefer API videoUrl/media_url when provided)
  const videoUrl = tokenId ? buildVideoUrl(tokenId, nft.videoUrl || nft.media_url) : undefined;

  // Get duration from various fields
  const duration = nft.videoDuration || nft.duration;

  // Get creator info from various possible fields
  const channel = nft.minterDisplayName ||
    nft.minterUsername ||
    nft.mintername ||
    nft.creator?.display_name ||
    nft.creator?.username ||
    'Unknown Creator';

  // Build canonical avatar URL using minter address
  const minterAddress = nft.minter || nft.creator?.id || '';
  const channelAvatar = buildAvatarUrl(minterAddress, nft.minterAvatarUrl) ||
    buildAvatarUrl(minterAddress, nft.creator?.avatar_url) ||
    'user';

  const verified = nft.creator?.is_verified || false;

  // Get view count from various fields
  const viewCount = nft.views || nft.view_count;

  // Get created date from various fields
  const createdAt = nft.createdAt || nft.created_at;

  // Get creator ID and username for profile navigation
  const creatorId = nft.minter || nft.creator?.id;
  const creatorUsername = nft.minterUsername || nft.mintername || nft.creator?.username;

  // Get stats
  const likeCount = nft.likes ?? nft.totalVotes?.for ?? nft.like_count ?? 0;
  const dislikeCount = nft.dislikes ?? nft.totalVotes?.against ?? nft.dislike_count ?? 0;
  const commentCount = nft.commentCount || nft.comment_count || 0;

  // Map content access fields from API
  const isPPV = nft.is_ppv ?? false;
  const ppvPrice = nft.ppv_price;
  const ppvCurrency = nft.ppv_currency || 'USDC';
  const isW2E = nft.is_w2e ?? false;
  const isLocked = nft.is_locked ?? false;
  const lockedPrice = nft.locked_price;
  const lockedCurrency = nft.locked_currency || 'DHB';

  return {
    id,
    type: 'video',
    thumbnail,
    videoUrl,
    duration: formatDuration(duration),
    durationSeconds: typeof duration === 'number' ? duration : 0,
    title: nft.name || nft.title || 'Untitled',
    channel,
    channelAvatar,
    verified,
    views: formatViews(viewCount),
    uploadedAgo: formatTimeAgo(createdAt),
    creatorId,
    creatorUsername,
    isLiked: nft.isLiked ?? false,
    isDisliked: nft.isDisliked ?? false,
    likeCount,
    dislikeCount,
    commentCount,
    isPPV,
    ppvPrice,
    ppvCurrency,
    isW2E,
    isLocked,
    lockedPrice,
    lockedCurrency,
  };
}

/**
 * Map DeHub NFT to ImagePost type
 * Handles both old and new API response field names
 * Supports multi-image posts (1-4 images)
 */
export function mapNFTToImagePost(nft: DeHubNFT, index: number): ImagePost {
  // Get ID from various possible fields
  const tokenId = nft.tokenId || nft.id || nft.token_id;
  const id = String(tokenId);

  // Build image URLs array from imageUrls field using shared utility
  const imageUrls = buildFeedImageUrls(nft.imageUrls) || [];

  // Get primary image URL (first from array or fallback to single image)
  const primaryImage = imageUrls[0] ||
    getMediaUrl(nft.imageUrl) ||
    getMediaUrl(nft.media_url) ||
    getMediaUrl(nft.thumbnail_url) ||
    FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];

  // Get creator info
  const username = nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.display_name || nft.creator?.username || 'unknown';
  // Build canonical avatar URL using minter address
  const minterAddress = nft.minter || nft.creator?.id || '';
  const avatar = buildAvatarUrl(minterAddress, nft.minterAvatarUrl) ||
    buildAvatarUrl(minterAddress, nft.creator?.avatar_url) ||
    'user';
  const verified = nft.creator?.is_verified || false;

  // Get stats
  const likes = nft.likes ?? nft.totalVotes?.for ?? nft.like_count ?? 0;
  const comments = nft.commentCount || nft.comment_count || 0;
  const viewCount = nft.views || nft.view_count || 0;

  // Get created date
  const createdAt = nft.createdAt || nft.created_at;

  // Get creator ID and username for profile navigation
  const creatorId = nft.minter || nft.creator?.id;
  const creatorUsername = nft.minterUsername || nft.mintername || nft.creator?.username;

  // Get title and description
  const title = nft.name || nft.title || '';
  const description = nft.description || '';

  return {
    id,
    type: 'image',
    username,
    verified,
    avatar,
    image: primaryImage,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    title,
    description,
    likes,
    caption: description || title, // Legacy field for backwards compatibility
    comments,
    views: formatViews(viewCount).replace(' views', ''),
    timeAgo: formatTimeAgo(createdAt),
    creatorId,
    creatorUsername,
    isLiked: nft.isLiked ?? false,
    isDisliked: nft.isDisliked ?? false,
    // PPV/Bounty/Locked fields
    isPPV: nft.is_ppv || nft.streamInfo?.isPayPerView || false,
    ppvPrice: nft.ppv_price || nft.streamInfo?.payPerViewAmount,
    ppvCurrency: nft.ppv_currency || 'DHB',
    isW2E: nft.is_w2e || nft.streamInfo?.isAddBounty || false,
    isLocked: nft.is_locked || nft.streamInfo?.isLockContent || false,
    lockedPrice: nft.locked_price || nft.streamInfo?.lockContentAmount,
    lockedCurrency: nft.locked_currency || nft.streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews: nft.streamInfo?.addBountyFirstXViewers != null ? Number(nft.streamInfo.addBountyFirstXViewers) : undefined,
    bountyComments: nft.streamInfo?.addBountyFirstXComments != null ? Number(nft.streamInfo.addBountyFirstXComments) : undefined,
    bountyAmount: nft.streamInfo?.addBountyAmount,
    bountyCurrency: nft.streamInfo?.addBountyTokenSymbol || 'DHB',
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

  // Build canonical avatar URL using minter address
  const minterAddress = nft.minter || nft.creator?.id || '';
  const avatar = buildAvatarUrl(minterAddress, nft.minterAvatarUrl) ||
    buildAvatarUrl(minterAddress, nft.creator?.avatar_url) ||
    'user';

  const viewCount = nft.views || nft.view_count || 0;
  const category = Array.isArray(nft.category) ? nft.category[0] : nft.category;

  // Get creator ID and username for profile navigation
  const creatorId = nft.minter || nft.creator?.id;
  const creatorUsername = nft.mintername || nft.creator?.username;

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
    creatorId,
    creatorUsername,
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

  // Build canonical avatar URL using minter address
  const minterAddress = nft.minter || nft.creator?.id || '';
  const avatar = buildAvatarUrl(minterAddress, nft.minterAvatarUrl) ||
    buildAvatarUrl(minterAddress, nft.creator?.avatar_url) ||
    '';

  return { name, avatar };
}

interface UseDeHubFeedOptions extends SearchNFTsParams {
  enabled?: boolean;
}

/**
 * Hook to fetch paginated DeHub feed content
 * By default, only shows minted (confirmed on-chain) content
 */
export function useDeHubFeed(options: UseDeHubFeedOptions = {}) {
  const { enabled = true, status = 'minted', ...searchParams } = options;

  return useInfiniteQuery({
    queryKey: ['dehub-feed', { ...searchParams, status }],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await searchNFTs({
        ...searchParams,
        status,
        page: pageParam,
        unit: searchParams.unit || 15,
      });

      // Handle both response formats: { result: [...] } or { data: [...] }
      const rawData = (response as any).result || response.data || [];

      // Filter out blocked creators and blocked posts
      const data = rawData.filter((nft: DeHubNFT) => !isBlockedCreator(nft) && !isBlockedPost(nft));

      const unit = searchParams.unit || 15;

      return {
        data,
        page: pageParam,
        has_more: rawData.length >= unit, // Use raw length to determine pagination
        total: response.total || data.length,
        unit,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled,
    staleTime: 1000 * 60 * 10, // 10 minutes - keep data fresh longer
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnMount: false, // Don't refetch when component remounts
    retry: 2,
  });
}

/**
 * Hook to fetch video content specifically
 * Note: postType is undefined for videos (same as home feed)
 */
export function useDeHubVideos(options: Omit<UseDeHubFeedOptions, 'postType'> = {}) {
  return useDeHubFeed(options);
}

/**
 * Hook to fetch image content specifically
 * Uses postType: "feed-images" to filter for images
 * Now accepts sortMode for API-level sorting
 */
export function useDeHubImages(options: Omit<UseDeHubFeedOptions, 'postType'> = {}) {
  return useDeHubFeed({
    ...options,
    postType: 'feed-images',
  });
}

/**
 * Hook to fetch live content specifically
 * Uses /api/live endpoint
 */
export function useDeHubLive(options: { unit?: number; sortMode?: 'viewers' | 'recent' | 'popular'; category?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['dehub-live', options],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const response = await getLiveStreams({
          page: pageParam,
          unit: options.unit || 15,
          sortMode: options.sortMode,
          category: options.category,
        });

        // API returns a plain array, not { result: [...] }
        const streams = Array.isArray(response) ? response : (response.result || []);

        return {
          data: streams,
          page: pageParam,
          has_more: streams.length >= (options.unit || 15),
          total: streams.length,
          limit: options.unit || 15,
        };
      } catch (error) {
        console.warn('[Live] Failed to fetch live streams:', error);
        // Return empty result on error
        return {
          data: [],
          page: pageParam,
          has_more: false,
          total: 0,
          limit: options.unit || 15,
        };
      }
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    staleTime: 0, // Live data should always be fresh
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always' as const,
    retry: 1,
  });
}

/**
 * Map API LiveStream to local LiveStream format
 */
export function mapApiLiveStreamToLocal(stream: ApiLiveStream, index: number): LiveStream {
  // API returns 'account' not 'streamer', and 'thumbnail' as relative path
  const rawAccount = (stream as any).account || stream.streamer;
  const rawThumbnail = (stream as any).thumbnail || stream.thumbnailUrl;
  const thumbnail = rawThumbnail
    ? (rawThumbnail.startsWith('http') ? rawThumbnail : `${DEHUB_CDN_BASE}${rawThumbnail}`)
    : FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];

  const streamerName = rawAccount?.displayName ||
    rawAccount?.username ||
    'Unknown Streamer';

  const avatar = rawAccount
    ? buildAvatarUrl(rawAccount.address, rawAccount.avatarImageUrl || rawAccount.avatarUrl)
    : '';

  // API uses _id not streamId, categories[] not category, totalViews not viewerCount
  const id = (stream as any)._id || stream.streamId || String(index);
  const category = Array.isArray((stream as any).categories) ? (stream as any).categories[0] : stream.category;
  const viewerCount = (stream as any).totalViews ?? (stream as any).peakViewers ?? stream.viewerCount ?? 0;
  const likeCount = (stream as any).likes ?? stream.likeCount ?? 0;

  return {
    id,
    type: 'live',
    streamer: streamerName,
    avatar,
    title: stream.title,
    game: category || 'Just Chatting',
    viewers: formatViews(viewerCount).replace(' views', ''),
    thumbnail,
    tags: [],
    isLive: stream.status === 'live' || (stream.status as string) === 'LIVE' || (stream.status as string) === 'active' || !!(stream as any).streamKey,
    playbackUrl: stream.playbackUrl || ((stream as any).playbackId ? `https://livepeercdn.com/hls/${(stream as any).playbackId}/index.m3u8` : undefined),
    playbackUrls: (stream as any).playbackId
      ? [
          `https://livepeercdn.com/hls/${(stream as any).playbackId}/index.m3u8`,
          `https://livepeercdn.studio/hls/${(stream as any).playbackId}/index.m3u8`,
        ]
      : undefined,
    creatorId: stream.address || rawAccount?.address,
    creatorUsername: rawAccount?.username,
    likeCount,
  };
}

/**
 * Hook to fetch unique story users from recent content
 * NOTE: Currently returns empty as there are no stories available
 */
export function useDeHubStoryUsers(_limit: number = 10) {
  // Return empty - no stories currently available
  return { storyUsers: [], isLoading: false };
}
