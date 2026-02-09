/**
 * Feed Utilities
 * ===============
 * Shared utility functions for feed components.
 * 
 * @module lib/feed-utils
 */

import type { DeHubNFT } from '@/lib/api/dehub';
import type { FeedItem, VideoItem, ImagePost, TextPost } from '@/types/feed.types';

// ============================================================================
// CONTENT ORDERING PATTERN (50-item cycle for Home Feed)
// ============================================================================

/**
 * Defines the exact sequence of content types in the home feed.
 * The pattern repeats every 50 items.
 * Total: 16 videos, 24 text posts, 10 images
 */
export const CONTENT_PATTERN: Array<'video' | 'text' | 'image'> = [
  // 1-3: 3 videos
  'video', 'video', 'video',
  // 4-5: 2 text posts
  'text', 'text',
  // 6: 1 image
  'image',
  // 7-9: 3 text posts
  'text', 'text', 'text',
  // 10-12: 3 videos
  'video', 'video', 'video',
  // 13: 1 text post
  'text',
  // 14: 1 image
  'image',
  // 15-17: 3 text posts
  'text', 'text', 'text',
  // 18-19: 2 videos
  'video', 'video',
  // 20-21: 2 text posts
  'text', 'text',
  // 22: 1 image
  'image',
  // 23-24: 2 text posts
  'text', 'text',
  // 25: 1 image
  'image',
  // 26-28: 3 text posts
  'text', 'text', 'text',
  // 29-31: 3 videos
  'video', 'video', 'video',
  // 32: 1 video
  'video',
  // 33: 1 text
  'text',
  // 34: 1 image
  'image',
  // 35: 1 video
  'video',
  // 36: 1 text
  'text',
  // 37: 1 image
  'image',
  // 38-40: 3 text
  'text', 'text', 'text',
  // 41-44: 4 images
  'image', 'image', 'image', 'image',
  // 45-47: 3 videos
  'video', 'video', 'video',
  // 48-50: 3 text
  'text', 'text', 'text',
];

export type ContentPatternType = 'video' | 'text' | 'image';

/**
 * Interleave content from three separate feeds according to the defined pattern.
 * Each queue maintains "most liked" order within its type.
 * If a queue is exhausted, that slot is skipped.
 */
export function interleaveByPattern<V, I, T>(
  videos: V[],
  images: I[],
  texts: T[],
  pattern: ContentPatternType[] = CONTENT_PATTERN
): Array<{ type: 'video'; data: V } | { type: 'image'; data: I } | { type: 'text'; data: T }> {
  const result: Array<{ type: 'video'; data: V } | { type: 'image'; data: I } | { type: 'text'; data: T }> = [];
  
  let videoIdx = 0;
  let imageIdx = 0;
  let textIdx = 0;
  
  // Calculate total available items
  const totalAvailable = videos.length + images.length + texts.length;
  if (totalAvailable === 0) return result;
  
  // Iterate through pattern, cycling if needed
  let patternIdx = 0;
  let safetyCounter = 0;
  const maxIterations = totalAvailable + pattern.length; // Prevent infinite loops
  
  while (result.length < totalAvailable && safetyCounter < maxIterations) {
    const contentType = pattern[patternIdx % pattern.length];
    patternIdx++;
    safetyCounter++;
    
    switch (contentType) {
      case 'video':
        if (videoIdx < videos.length) {
          result.push({ type: 'video', data: videos[videoIdx] });
          videoIdx++;
        }
        break;
      case 'image':
        if (imageIdx < images.length) {
          result.push({ type: 'image', data: images[imageIdx] });
          imageIdx++;
        }
        break;
      case 'text':
        if (textIdx < texts.length) {
          result.push({ type: 'text', data: texts[textIdx] });
          textIdx++;
        }
        break;
    }
  }
  
  return result;
}

// ============================================================================
// SORT OPTIONS (Used across all feeds)
// ============================================================================

export const SORT_OPTIONS = [
  { label: 'Latest', value: 'latest' as const },
  { label: 'Following', value: 'following' as const },
  { label: 'Subscribed', value: 'subscribed' as const },
  { label: 'Most Viewed', value: 'most-viewed' as const },
  { label: 'Most Liked', value: 'most-liked' as const },
  { label: 'Most Comments', value: 'most-comments' as const },
  { label: 'Random', value: 'random' as const },
] as const;

export type SortOption = typeof SORT_OPTIONS[number];
export type SortValue = SortOption['value'];

// ============================================================================
// API SORT MODE MAPPING
// ============================================================================

/**
 * Map UI sort values to DeHub API sortMode parameter.
 * - "new" = newest first (default)
 * - "popular" = sorted by views/likes 
 * - "trending" = currently trending
 */
export type ApiSortMode = 'new' | 'popular' | 'trending';

export function getApiSortMode(sortValue: SortValue): ApiSortMode {
  switch (sortValue) {
    case 'most-viewed':
    case 'most-liked':
      return 'popular';
    case 'most-comments':
      // API doesn't support comment sorting, use popular as fallback
      return 'popular';
    case 'latest':
    default:
      return 'new';
  }
}

// ============================================================================
// DATE FILTER OPTIONS (Used across all feeds)
// ============================================================================

export const DATE_FILTER_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: '1d', value: 'today' as const },
  { label: '1w', value: 'week' as const },
  { label: '1m', value: 'month' as const },
  { label: '1y', value: 'year' as const },
] as const;

export type DateFilterOption = typeof DATE_FILTER_OPTIONS[number];
export type DateFilterValue = DateFilterOption['value'];

// ============================================================================
// SORTING FUNCTIONS
// ============================================================================

/**
 * Extract raw sorting values from an NFT object
 */
function getNFTSortValues(nft: DeHubNFT) {
  return {
    views: nft.views || nft.view_count || 0,
    likes: nft.totalVotes?.for || nft.like_count || 0,
    comments: nft.commentCount || nft.comment_count || 0,
    createdAt: new Date(nft.createdAt || nft.created_at || 0).getTime(),
  };
}

/**
 * Sort NFTs by creation date (newest first)
 */
export function sortByLatest<T extends DeHubNFT>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return getNFTSortValues(b).createdAt - getNFTSortValues(a).createdAt;
  });
}

/**
 * Sort NFTs by view count (highest first)
 */
export function sortByMostViewed<T extends DeHubNFT>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return getNFTSortValues(b).views - getNFTSortValues(a).views;
  });
}

/**
 * Sort NFTs by like count (highest first)
 */
export function sortByMostLiked<T extends DeHubNFT>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return getNFTSortValues(b).likes - getNFTSortValues(a).likes;
  });
}

/**
 * Sort NFTs by comment count (highest first)
 */
export function sortByMostComments<T extends DeHubNFT>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return getNFTSortValues(b).comments - getNFTSortValues(a).comments;
  });
}

/** Fields needed for trending score calculation */
interface TrendingScoreFields {
  totalVotes?: { for?: number; against?: number };
  like_count?: number;
  views?: number;
  view_count?: number;
  commentCount?: number;
  comment_count?: number;
  createdAt?: string;
  created_at?: string;
}

/**
 * Calculate trending score for a post.
 * Higher scores = more trending (recent + high engagement).
 * 
 * Formula: log10(1 + engagement) / (hoursAge + 2)^1.5
 * - Logarithmic numerator prevents mega-popular posts from dominating
 * - Time decay penalizes older content progressively
 * - Comments weighted 2x (high engagement signal)
 * - Views weighted 0.1x (low signal, easily inflated)
 */
export function calculateTrendingScore(item: TrendingScoreFields): number {
  const likes = item.totalVotes?.for || item.like_count || 0;
  const views = item.views || item.view_count || 0;
  const comments = item.commentCount || item.comment_count || 0;
  
  // Weighted engagement: comments are high signal, views are low signal
  const engagement = likes + (views * 0.1) + (comments * 2);
  
  // Hours since creation
  const createdAt = new Date(item.createdAt || item.created_at || Date.now());
  const hoursAge = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
  
  // Trending formula with time decay (exponent 1.5 = moderate decay)
  const score = Math.log10(1 + engagement) / Math.pow(hoursAge + 2, 1.5);
  
  return score;
}

/**
 * Shuffle items within score buckets.
 * Groups items with similar trending scores and shuffles within each bucket.
 * This keeps genuinely trending content near the top while varying the order.
 * 
 * @param items - Items already sorted by trending score
 * @param bucketSize - Number of items per bucket (default 5)
 */
export function shuffleWithinBuckets<T>(items: T[], bucketSize = 5): T[] {
  if (items.length <= 1) return items;
  
  const result: T[] = [];
  
  // Process in buckets
  for (let i = 0; i < items.length; i += bucketSize) {
    const bucket = items.slice(i, Math.min(i + bucketSize, items.length));
    
    // Fisher-Yates shuffle within bucket
    for (let j = bucket.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [bucket[j], bucket[k]] = [bucket[k], bucket[j]];
    }
    
    result.push(...bucket);
  }
  
  return result;
}

/**
 * Sort NFTs by trending score (highest first)
 */
export function sortByTrending<T extends DeHubNFT>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return calculateTrendingScore(b) - calculateTrendingScore(a);
  });
}

/**
 * Apply sorting based on sort value
 * Note: For 'random', use shuffleArray separately with a seed
 */
export function applySorting<T extends DeHubNFT>(items: T[], sortValue: SortValue): T[] {
  if (items.length === 0) return items;
  
  switch (sortValue) {
    case 'most-viewed':
      return sortByMostViewed(items);
    case 'most-liked':
      return sortByMostLiked(items);
    case 'most-comments':
      return sortByMostComments(items);
    case 'latest':
    default:
      return sortByLatest(items);
  }
}

// ============================================================================
// DATE FILTERING FUNCTIONS
// ============================================================================

/**
 * Get the cutoff timestamp for a date filter value
 */
function getDateCutoff(dateFilter: DateFilterValue): number {
  const now = new Date();
  
  switch (dateFilter) {
    case 'today': {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return startOfDay.getTime();
    }
    case 'week': {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
      return startOfWeek.getTime();
    }
    case 'month': {
      const startOfMonth = new Date(now);
      startOfMonth.setMonth(now.getMonth() - 1);
      return startOfMonth.getTime();
    }
    case 'year': {
      const startOfYear = new Date(now);
      startOfYear.setFullYear(now.getFullYear() - 1);
      return startOfYear.getTime();
    }
    case 'all':
    default:
      return 0;
  }
}

/**
 * Filter NFTs by upload date
 */
export function filterByDate<T extends DeHubNFT>(items: T[], dateFilter: DateFilterValue): T[] {
  if (dateFilter === 'all') return items;
  
  const cutoff = getDateCutoff(dateFilter);
  
  return items.filter(nft => {
    const createdAt = new Date(nft.createdAt || nft.created_at || 0).getTime();
    return createdAt >= cutoff;
  });
}

// ============================================================================
// CONTENT TYPE FILTER OPTIONS (PPV, Bounty, Locked)
// ============================================================================

export const CONTENT_TYPE_FILTERS = [
  { label: 'PPV', value: 'ppv' as const, description: 'Pay-per-view content' },
  { label: 'Bounty', value: 'w2e' as const, description: 'Watch to earn' },
  { label: 'Locked', value: 'locked' as const, description: 'Subscribers only' },
] as const;

export type ContentTypeFilterOption = typeof CONTENT_TYPE_FILTERS[number];
export type ContentTypeFilterValue = ContentTypeFilterOption['value'];

export interface ContentTypeFilters {
  ppv: boolean;
  w2e: boolean;
  locked: boolean;
}

// ============================================================================
// POST TYPE FILTER OPTIONS (Video, Images, Text)
// ============================================================================

export const POST_TYPE_FILTERS = [
  { label: 'All', value: 'all' as const },
  { label: 'Videos', value: 'video' as const },
  { label: 'Images', value: 'feed-images' as const },
  { label: 'Text', value: 'feed-simple' as const },
] as const;

export type PostTypeFilterOption = typeof POST_TYPE_FILTERS[number];
export type PostTypeFilterValue = PostTypeFilterOption['value'];

/**
 * Filter NFTs by content type (PPV, W2E/Bounty, Locked)
 * Uses OR logic - if multiple filters are active, show items matching ANY filter
 */
export function filterByContentType<T extends DeHubNFT>(
  items: T[],
  filters: ContentTypeFilters
): T[] {
  const hasActiveFilters = filters.ppv || filters.w2e || filters.locked;
  
  // If no filters active, return all items
  if (!hasActiveFilters) return items;
  
  return items.filter(nft => {
    // PPV check - use is_ppv field or check for ppv_price > 0
    if (filters.ppv && (nft.is_ppv || (nft.ppv_price && nft.ppv_price > 0))) {
      return true;
    }
    
    // W2E/Bounty check - currently API doesn't expose this field directly
    // Placeholder: check for any w2e-related fields in the response
    if (filters.w2e) {
      // @ts-ignore - checking for potential w2e fields
      const hasW2E = nft.is_w2e || nft.isW2E || nft.bounty || nft.reward;
      if (hasW2E) return true;
    }
    
    // Locked check - subscriber-only content
    if (filters.locked) {
      // @ts-ignore - checking for potential locked fields
      const isLocked = nft.is_locked || nft.isLocked || nft.subscribersOnly;
      if (isLocked) return true;
    }
    
    return false;
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Shuffle an array deterministically based on a seed.
 * Useful for consistent randomization on refresh.
 */
export function shuffleArray<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  let randomValue = seed;

  while (currentIndex !== 0) {
    randomValue = (randomValue * 9301 + 49297) % 233280;
    const randomIndex = Math.floor((randomValue / 233280) * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
}


/**
 * Format a large number with K/M suffix.
 */
export function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// ============================================================================
// COMMON FORMATTING HELPERS (Consolidated from multiple files)
// ============================================================================

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format view count to human readable string
 */
export function formatViews(count?: number): string {
  if (!count) return '0 views';
  
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}

/**
 * Format time ago from ISO date string.
 * Evaluates from largest to smallest unit, never showing 0 values.
 */
export function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  
  const date = new Date(dateString);
  // Guard against invalid dates
  if (isNaN(date.getTime())) return 'Just now';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Handle future dates or invalid timestamps
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  // Always use the largest non-zero unit, never show 0 of anything
  if (diffYears >= 1) return `${diffYears}y`;
  if (diffMonths >= 1) return `${diffMonths}mo`;
  if (diffWeeks >= 1) return `${diffWeeks}w`;
  if (diffDays >= 1) return `${diffDays}d`;
  if (diffHours >= 1) return `${diffHours}h`;
  if (diffMins >= 1) return `${diffMins}m`;
  return 'Just now';
}

// ============================================================================
// CREATOR DIVERSITY LIMITING
// ============================================================================

/**
 * Limit how many posts from the same creator can appear in the feed and ensure
 * minimum spacing between posts from the same creator.
 * 
 * This ensures variety in the feed by:
 * 1. Limiting max posts per creator across the entire feed
 * 2. Enforcing minimum spacing between posts from the same creator
 * 
 * @param items - The sorted feed items to filter
 * @param maxPerCreator - Maximum posts per creator in the entire feed (default: 3)
 * @param minSpacing - Minimum items between same-creator posts (default: 5)
 * @param getCreatorId - Function to extract creator ID from an item
 * @returns Reordered items with diversity applied
 */
export function limitCreatorDiversity<T>(
  items: T[],
  maxPerCreator: number = 3,
  getCreatorId: (item: T) => string | undefined,
  minSpacing: number = 5
): T[] {
  if (items.length === 0 || maxPerCreator <= 0) return items;
  
  const creatorCounts = new Map<string, number>();
  const creatorLastIndex = new Map<string, number>();
  const result: T[] = [];
  const deferred: { item: T; creatorId: string }[] = [];
  
  // First pass: place items that meet both count and spacing requirements
  for (const item of items) {
    const creatorId = getCreatorId(item) || 'unknown';
    const count = creatorCounts.get(creatorId) || 0;
    const lastIndex = creatorLastIndex.get(creatorId);
    const currentIndex = result.length;
    
    // Check if we can place this item (within limit and spaced out)
    const withinLimit = count < maxPerCreator;
    const hasSpacing = lastIndex === undefined || (currentIndex - lastIndex) >= minSpacing;
    
    if (withinLimit && hasSpacing) {
      result.push(item);
      creatorCounts.set(creatorId, count + 1);
      creatorLastIndex.set(creatorId, currentIndex);
    } else if (withinLimit) {
      // Within limit but needs spacing - defer for later placement
      deferred.push({ item, creatorId });
    }
    // If over limit, skip entirely (don't show same creator more than maxPerCreator times)
  }
  
  // Second pass: try to place deferred items with spacing
  for (const { item, creatorId } of deferred) {
    const count = creatorCounts.get(creatorId) || 0;
    if (count >= maxPerCreator) continue; // Skip if now over limit
    
    // Find a valid position with spacing
    const lastIndex = creatorLastIndex.get(creatorId);
    const minValidIndex = lastIndex !== undefined ? lastIndex + minSpacing : 0;
    
    if (result.length >= minValidIndex) {
      result.push(item);
      creatorCounts.set(creatorId, count + 1);
      creatorLastIndex.set(creatorId, result.length - 1);
    }
  }
  
  return result;
}

/** Default max posts per creator in the home feed */
export const DEFAULT_MAX_POSTS_PER_CREATOR = 3;

/** Default minimum spacing between same-creator posts */
export const DEFAULT_MIN_CREATOR_SPACING = 5;
