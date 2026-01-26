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
 * Generate a deterministic view count based on an ID string.
 * Returns formatted string (e.g., "12.5K" or "450").
 */
export function getViewCount(id: string, maxViews: number = 100000, minViews: number = 500): string {
  const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const views = Math.floor((seed * 1234) % maxViews) + minViews;
  return formatCount(views);
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
