/**
 * Feed Utilities
 * ===============
 * Shared utility functions for feed components.
 * 
 * @module lib/feed-utils
 */

import type { DeHubNFT } from '@/lib/api/dehub';

// ============================================================================
// SORT OPTIONS (Used across all feeds)
// ============================================================================

export const SORT_OPTIONS = [
  { label: 'Random', value: 'random' as const },
  { label: 'Latest', value: 'latest' as const },
  { label: 'Most Viewed', value: 'most-viewed' as const },
  { label: 'Most Liked', value: 'most-liked' as const },
  { label: 'Most Comments', value: 'most-comments' as const },
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
    case 'random':
      // For random, fetch latest and shuffle client-side
      return 'new';
    case 'latest':
    default:
      return 'new';
  }
}

// ============================================================================
// DATE FILTER OPTIONS (Used across all feeds)
// ============================================================================

export const DATE_FILTER_OPTIONS = [
  { label: 'All time', value: 'all' as const },
  { label: 'Today', value: 'today' as const },
  { label: 'This week', value: 'week' as const },
  { label: 'This month', value: 'month' as const },
  { label: 'This year', value: 'year' as const },
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

/**
 * Apply sorting based on sort value
 * Note: For 'random', use shuffleArray separately with a seed
 */
export function applySorting<T extends DeHubNFT>(items: T[], sortValue: SortValue, randomSeed?: number): T[] {
  if (items.length === 0) return items;
  
  switch (sortValue) {
    case 'random':
      // Shuffle with provided seed or a random one
      return shuffleArray(items, randomSeed ?? Math.random() * 1000000);
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
