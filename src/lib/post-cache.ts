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
import { getViewCount } from '@/lib/feed-utils';

/**
 * Convert VideoItem back to partial DeHubNFT format for caching
 */
function videoItemToNFT(video: VideoItem): Partial<DeHubNFT> {
  return {
    tokenId: parseInt(video.id) || 0,
    postType: 'video',
    title: video.title,
    name: video.title,
    description: video.title,
    imageUrl: video.thumbnail,
    videoUrl: video.videoUrl,
    videoDuration: typeof video.duration === 'number' ? video.duration : 0,
    duration: typeof video.duration === 'number' ? video.duration : 0,
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
    totalVotes: {
      for: post.stats.likes || 0,
      against: 0,
    },
    commentCount: post.stats.comments || 0,
  };
}

/**
 * Pre-cache video data before navigation
 */
export function cacheVideoForNavigation(queryClient: QueryClient, video: VideoItem): void {
  const nftData = videoItemToNFT(video);
  queryClient.setQueryData(['single-post', video.id], nftData);
}

/**
 * Pre-cache image post data before navigation
 */
export function cacheImageForNavigation(queryClient: QueryClient, post: ImagePost): void {
  const nftData = imagePostToNFT(post);
  queryClient.setQueryData(['single-post', post.id], nftData);
}

/**
 * Pre-cache text post data before navigation
 */
export function cacheTextPostForNavigation(queryClient: QueryClient, post: TextPost): void {
  const nftData = textPostToNFT(post);
  queryClient.setQueryData(['single-post', post.id], nftData);
}
