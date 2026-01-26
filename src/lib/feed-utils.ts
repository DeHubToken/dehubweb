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
