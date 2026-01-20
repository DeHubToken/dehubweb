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
}

/**
 * Text post content
 */
export interface TextPost extends BaseFeedItem {
  type: 'post';
  author: User;
  content: string;
  stats: {
    comments: number;
    reposts: number;
    likes: number;
  };
}

/**
 * Video content item
 */
export interface VideoItem extends BaseFeedItem {
  type: 'video';
  thumbnail: string;
  videoUrl?: string;
  duration: string;
  title: string;
  channel: string;
  channelAvatar: string;
  verified: boolean;
  views: string;
  uploadedAgo: string;
}

/**
 * Image post content
 */
export interface ImagePost extends BaseFeedItem {
  type: 'image';
  username: string;
  verified: boolean;
  avatar: string;
  image: string;
  likes: number;
  caption: string;
  comments: number;
  timeAgo: string;
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
}

/**
 * Short-form video content
 */
export interface ShortVideo extends BaseFeedItem {
  type: 'short';
  username: string;
  verified: boolean;
  likes: string;
  thumbnail: string;
  videoUrl: string;
  description?: string;
  sound?: string;
  comments?: string;
  shares?: string;
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
