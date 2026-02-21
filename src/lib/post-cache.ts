/**
 * Post Cache Utilities
 * ====================
 * Pre-populates React Query cache for instant post navigation.
 * 
 * When clicking a post in the feed, we cache its data before navigation
 * so the SinglePostPage displays instantly without a loading phase.
 */

import { QueryClient } from '@tanstack/react-query';
import type { DeHubNFT } from '@/lib/api/dehub';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';
import { getVoteCache } from '@/lib/vote-cache';

/**
 * Parse a duration string (e.g., "1:23" or "1:02:34") back to seconds
 */
function parseDurationToSeconds(duration: string): number {
  if (!duration || duration === '0:00') return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }
  return 0;
}


/**
 * Convert VideoItem back to partial DeHubNFT format for caching
 */
function videoItemToNFT(video: VideoItem): Partial<DeHubNFT> {
  return {
    tokenId: parseInt(video.id) || 0,
    postType: 'video',
    title: video.title,
    name: video.title,
    description: video.description || video.title,
    imageUrl: video.thumbnail,
    videoUrl: video.videoUrl,
    videoDuration: video.durationSeconds || parseDurationToSeconds(video.duration),
    duration: video.durationSeconds || parseDurationToSeconds(video.duration),
    minterDisplayName: video.channel,
    mintername: video.creatorUsername,
    minterAvatarUrl: video.channelAvatar,
    minter: video.creatorId,
    status: video.status || 'minted',
    views: parseInt(video.views) || 0,
    isLiked: video.isLiked,
    isDisliked: video.isDisliked,
    totalVotes: {
      for: video.likeCount || 0,
      against: video.dislikeCount || 0,
    },
    commentCount: video.commentCount || 0,
    is_ppv: video.isPPV,
    ppv_price: video.ppvPrice,
    ppv_currency: video.ppvCurrency,
    is_w2e: video.isW2E,
    is_locked: video.isLocked,
    locked_price: video.lockedPrice,
    locked_currency: video.lockedCurrency,
    isOwner: video.isOwner,
    isUnlocked: video.isUnlocked,
    // Preserve the original timestamp - uploadedAgo is already formatted, so we need to pass createdAt
    createdAt: video.createdAt,
    // Include bounty data in streamInfo for proper reconstruction
    streamInfo: video.isW2E ? {
      isAddBounty: true,
      addBountyFirstXViewers: video.bountyViews,
      addBountyFirstXComments: video.bountyComments,
      addBountyAmount: video.bountyAmount,
      addBountyTokenSymbol: video.bountyCurrency || 'DHB',
    } : undefined,
  };
}

/**
 * Convert ImagePost back to partial DeHubNFT format for caching
 */
function imagePostToNFT(post: ImagePost): Partial<DeHubNFT> {
  return {
    tokenId: parseInt(post.id) || 0,
    postType: 'image',
    title: post.title,
    name: post.title,
    description: post.description || post.caption,
    imageUrl: post.image,
    imageUrls: post.imageUrls,
    minterDisplayName: post.username,
    mintername: post.creatorUsername,
    minterAvatarUrl: post.avatar,
    minter: post.creatorId,
    status: post.status || 'minted',
    views: parseInt(post.views || '0') || 0,
    isLiked: post.isLiked,
    isDisliked: post.isDisliked,
    totalVotes: {
      for: post.likes || 0,
      against: 0,
    },
    commentCount: post.comments || 0,
    // Preserve the original timestamp - timeAgo is already formatted, so we need to pass createdAt
    createdAt: post.createdAt,
    // Preserve gating fields (PPV/Bounty/Locked)
    is_ppv: post.isPPV || false,
    ppv_price: post.ppvPrice,
    ppv_currency: post.ppvCurrency,
    is_w2e: post.isW2E || false,
    is_locked: post.isLocked || false,
    locked_price: post.lockedPrice,
    locked_currency: post.lockedCurrency,
    isOwner: post.isOwner,
    isUnlocked: post.isUnlocked,
    streamInfo: {
      ...(post.bountyAmount != null && { addBountyAmount: post.bountyAmount }),
      ...(post.bountyViews != null && { addBountyFirstXViewers: post.bountyViews }),
      ...(post.bountyComments != null && { addBountyFirstXComments: post.bountyComments }),
      ...(post.bountyCurrency && { addBountyTokenSymbol: post.bountyCurrency }),
    } as any,
  };
}

/**
 * Convert TextPost back to partial DeHubNFT format for caching
 * Note: postType is set to 'image' as fallback since DeHubNFT doesn't have a 'text' type
 */
function textPostToNFT(post: TextPost): Partial<DeHubNFT> {
  return {
    tokenId: parseInt(post.id) || 0,
    // Use undefined to let SinglePostPage detect as text post via absence of media
    postType: undefined,
    description: post.content,
    title: post.content.slice(0, 100),
    name: post.content.slice(0, 100),
    minterDisplayName: post.author.name,
    mintername: post.author.handle,
    minterAvatarUrl: post.author.avatarSeed,
    minter: post.author.id,
    status: post.status || 'minted',
    views: parseInt(post.views || '0') || 0,
    isLiked: post.isLiked,
    isDisliked: post.isDisliked,
    totalVotes: {
      for: post.stats.likes || 0,
      against: 0,
    },
    commentCount: post.stats.comments || 0,
    // Preserve the original timestamp
    createdAt: post.createdAt,
  };
}

/**
 * Merge any recent vote cache entry into NFT data
 */
function applyVoteCache(postId: string, nft: Partial<DeHubNFT>): Partial<DeHubNFT> {
  const cached = getVoteCache(postId);
  if (!cached) return nft;
  return {
    ...nft,
    isLiked: cached.isLiked,
    isDisliked: cached.isDisliked,
    totalVotes: {
      for: cached.likeCount,
      against: cached.dislikeCount,
    },
  };
}

/**
 * Pre-cache video data before navigation
 */
export function cacheVideoForNavigation(queryClient: QueryClient, video: VideoItem): void {
  const nftData = applyVoteCache(video.id, videoItemToNFT(video));
  queryClient.setQueryData(['single-post', video.id], nftData);
}

/**
 * Pre-cache image post data before navigation
 */
export function cacheImageForNavigation(queryClient: QueryClient, post: ImagePost): void {
  const nftData = applyVoteCache(post.id, imagePostToNFT(post));
  queryClient.setQueryData(['single-post', post.id], nftData);
}

/**
 * Pre-cache text post data before navigation
 */
export function cacheTextPostForNavigation(queryClient: QueryClient, post: TextPost): void {
  const nftData = applyVoteCache(post.id, textPostToNFT(post));
  queryClient.setQueryData(['single-post', post.id], nftData);
}
