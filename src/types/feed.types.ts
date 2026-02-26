/**
 * Feed Types
 * ===========
 * Centralized type definitions for all feed-related content.
 * These types ensure consistency across all feed components.
 * 
 * @module types/feed
 */

import type { User } from './app.types';

/**
 * Content type badge variants for universal card headers
 */
export type ContentType = 'post' | 'video' | 'image' | 'live' | 'short';

/**
 * Badge configuration for content type labels
 */
export interface ContentBadge {
  label: string;
  className: string;
}

/**
 * Base interface for all feed content items
 */
export interface BaseFeedItem {
  id: string;
  createdAt?: string;
  /** Whether this is an optimistic (processing) post not yet minted */
  isOptimistic?: boolean;
}

/**
 * Text post content
 */
export interface TextPost extends BaseFeedItem {
  type: 'post';
  author: User;
  content: string;
  /** Formatted view count string (e.g., "1.2K") */
  views?: string;
  /** Mint status: 'minted' | 'signed' (pending) */
  status?: 'minted' | 'signed' | string;
  stats: {
    comments: number;
    reposts: number;
    likes: number;
  };
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
  /** Whether this is a quote post */
  isQuotePost?: boolean;
  /** The quoted post data (for rendering embedded quote) */
  quotedPost?: import('@/lib/api/dehub/types').DeHubNFT | null;
}

/**
 * Video content item
 */
export interface VideoItem extends BaseFeedItem {
  type: 'video';
  thumbnail: string;
  videoUrl?: string;
  /** Formatted duration string (e.g., "1:23") */
  duration: string;
  /** Raw duration in seconds for caching/filtering */
  durationSeconds?: number;
  title: string;
  /** Video description/body text */
  description?: string;
  channel: string;
  channelAvatar: string;
  verified: boolean;
  views: string;
  uploadedAgo: string;
  /** Mint status: 'minted' | 'signed' (pending) */
  status?: 'minted' | 'signed' | string;
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Creator's badge balance from API (avoids edge function call) */
  creatorBadgeBalance?: number;
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
  /** Number of likes */
  likeCount?: number;
  /** Number of dislikes */
  dislikeCount?: number;
  /** Number of comments */
  commentCount?: number;
  /** Whether content is pay-per-view */
  isPPV?: boolean;
  /** PPV price amount */
  ppvPrice?: number;
  /** PPV currency (e.g., "USDC", "DHB") */
  ppvCurrency?: string;
  /** Whether content is watch-to-earn/bounty */
  isW2E?: boolean;
  /** Whether content is subscriber-only locked */
  isLocked?: boolean;
  /** Locked: price to unlock */
  lockedPrice?: number;
  /** Locked: currency (DHB, USDC) */
  lockedCurrency?: string;
  /** Bounty: number of viewers to reward */
  bountyViews?: number;
  /** Bounty: number of commenters to reward */
  bountyComments?: number;
  /** Bounty: total reward amount */
  bountyAmount?: number;
  /** Bounty: reward currency (DHB, USDC) */
  bountyCurrency?: string;
  /** Whether this is an ad/sponsored post */
  isAd?: boolean;
  /** Whether the current viewer is the content owner */
  isOwner?: boolean;
  /** Whether the content has been unlocked for the current viewer (purchased/earned) */
  isUnlocked?: boolean;
  /** Chain ID the content was minted on (e.g., 8453 for Base, 56 for BNB) */
  chainId?: number;
}

/**
 * Image post content
 */
export interface ImagePost extends BaseFeedItem {
  type: 'image';
  username: string;
  verified: boolean;
  avatar: string;
  /** Primary image URL (first image or legacy single image) */
  image: string;
  /** Array of image URLs for multi-image posts (1-4 images) */
  imageUrls?: string[];
  /** Post title */
  title?: string;
  /** Post description */
  description?: string;
  likes: number;
  /** @deprecated Use title/description instead */
  caption: string;
  comments: number;
  /** Mint status: 'minted' | 'signed' (pending) */
  status?: 'minted' | 'signed' | string;
  /** Formatted view count string (e.g., "1.2K") */
  views: string;
  timeAgo: string;
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Creator's badge balance from API (avoids edge function call) */
  creatorBadgeBalance?: number;
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
  /** Whether content is pay-per-view */
  isPPV?: boolean;
  /** PPV price amount */
  ppvPrice?: number;
  /** PPV currency (e.g., "USDC", "DHB") */
  ppvCurrency?: string;
  /** Whether content is watch-to-earn/bounty */
  isW2E?: boolean;
  /** Whether content is subscriber-only locked */
  isLocked?: boolean;
  /** Locked: price to unlock */
  lockedPrice?: number;
  /** Locked: currency (DHB, USDC) */
  lockedCurrency?: string;
  /** Bounty: number of viewers to reward */
  bountyViews?: number;
  /** Bounty: number of commenters to reward */
  bountyComments?: number;
  /** Bounty: total reward amount */
  bountyAmount?: number;
  /** Bounty: reward currency (DHB, USDC) */
  bountyCurrency?: string;
  /** Whether the current viewer is the content owner */
  isOwner?: boolean;
  /** Whether the content has been unlocked for the current viewer (purchased/earned) */
  isUnlocked?: boolean;
  /** Chain ID the content was minted on (e.g., 8453 for Base, 56 for BNB) */
  chainId?: number;
}

/**
 * Live stream content
 */
export interface LiveStream extends BaseFeedItem {
  type: 'live';
  streamer: string;
  avatar: string;
  title: string;
  game: string;
  viewers: string;
  thumbnail: string;
  tags: string[];
  isLive: boolean;
  /** HLS playback URL (.m3u8) */
  playbackUrl?: string;
  /** Fallback URLs to try if primary fails (e.g. alternate Livepeer CDN) */
  playbackUrls?: string[];
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Number of likes */
  likeCount?: number;
  /** Number of comments */
  commentCount?: number;
  /** MongoDB ObjectId of the stream (needed for /api/live/{id}/settings API calls) */
  streamId?: string;
}

/**
 * Short-form video content
 */
export interface ShortVideo extends BaseFeedItem {
  type: 'short';
  username: string;
  verified: boolean;
  /** Creator's avatar URL */
  avatar?: string;
  likes: string;
  thumbnail: string;
  videoUrl: string;
  description?: string;
  sound?: string;
  comments?: string;
  shares?: string;
  /** Formatted view count string (e.g., "1.2K") */
  views?: string;
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Creator's display name */
  displayName?: string;
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
}

/**
 * Union type for all feed content
 */
export type FeedItem = TextPost | VideoItem | ImagePost | LiveStream | ShortVideo;

/**
 * Props for the universal card header component
 */
export interface CardHeaderProps {
  username: string;
  avatarSeed: string;
  verified?: boolean;
  contentType: ContentType;
  isLive?: boolean;
}

/**
 * Props for the universal action bar component
 */
export interface ActionBarProps {
  onLike?: () => void;
  onDislike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  className?: string;
}
