/**
 * Type Guards
 * ============
 * Runtime type checking utilities for feed items and other unions.
 * Use these to narrow types safely at runtime.
 * 
 * @module lib/type-guards
 * @example
 * ```tsx
 * if (isVideoItem(item)) {
 *   console.log(item.duration); // TypeScript knows this is VideoItem
 * }
 * ```
 */

import type { 
  FeedItem, 
  TextPost, 
  VideoItem, 
  ImagePost, 
  LiveStream, 
  ShortVideo 
} from '@/types/feed.types';

/**
 * Check if a feed item is a text post
 */
export function isTextPost(item: FeedItem): item is TextPost {
  return item.type === 'post';
}

/**
 * Check if a feed item is a video
 */
export function isVideoItem(item: FeedItem): item is VideoItem {
  return item.type === 'video';
}

/**
 * Check if a feed item is an image post
 */
export function isImagePost(item: FeedItem): item is ImagePost {
  return item.type === 'image';
}

/**
 * Check if a feed item is a live stream
 */
export function isLiveStream(item: FeedItem): item is LiveStream {
  return item.type === 'live';
}

/**
 * Check if a feed item is a short video
 */
export function isShortVideo(item: FeedItem): item is ShortVideo {
  return item.type === 'short';
}

/**
 * Check if a value is non-null and non-undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if a string is non-empty
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if an array is non-empty
 */
export function isNonEmptyArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}
