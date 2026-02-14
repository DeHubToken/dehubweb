/**
 * Persisted Feed Filter Hook
 * ==========================
 * Persists feed filter states to sessionStorage so they survive navigation.
 * Uses a single storage key for all feed filter states.
 * 
 * @module hooks/use-persisted-feed-filter
 */

import { useState, useEffect, useCallback } from 'react';

// Single storage key for all feed filter states
const FEED_FILTERS_STORAGE_KEY = 'feed-filter-states';

type FeedType = 'home' | 'videos' | 'shorts' | 'images' | 'music';

interface AllFeedFilters {
  home?: Record<string, unknown>;
  videos?: Record<string, unknown>;
  shorts?: Record<string, unknown>;
  images?: Record<string, unknown>;
  music?: Record<string, unknown>;
}

/**
 * Get all persisted filter states from sessionStorage
 */
function getAllFilters(): AllFeedFilters {
  try {
    const stored = sessionStorage.getItem(FEED_FILTERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

/**
 * Save all filter states to sessionStorage
 */
function saveAllFilters(filters: AllFeedFilters): void {
  try {
    sessionStorage.setItem(FEED_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Get a specific filter value for a feed
 */
function getFilterValue<T>(feedType: FeedType, filterKey: string, defaultValue: T): T {
  const allFilters = getAllFilters();
  const feedFilters = allFilters[feedType];
  
  if (feedFilters && filterKey in feedFilters) {
    return feedFilters[filterKey] as T;
  }
  
  return defaultValue;
}

/**
 * Set a specific filter value for a feed.
 * Exported so external code (e.g. sidebar) can pre-set a filter before navigation.
 */
export function setFilterValue<T>(feedType: FeedType, filterKey: string, value: T): void {
  const allFilters = getAllFilters();
  
  if (!allFilters[feedType]) {
    allFilters[feedType] = {};
  }
  
  allFilters[feedType]![filterKey] = value;
  saveAllFilters(allFilters);
}

/**
 * Clear all persisted feed filters
 * Call this on explicit refresh (pull-to-refresh, home button double-click)
 */
export function clearPersistedFeedFilters(): void {
  try {
    sessionStorage.removeItem(FEED_FILTERS_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook that provides a useState-like API with sessionStorage persistence.
 * Use this in place of useState for filter states that should survive navigation.
 * 
 * @param feedType - The feed this filter belongs to ('home', 'videos', etc.)
 * @param filterKey - Unique key for this filter within the feed ('sort', 'date', etc.)
 * @param defaultValue - Default value if nothing is persisted
 * @returns [value, setValue] tuple like useState
 * 
 * @example
 * const [selectedSort, setSelectedSort] = usePersistedFeedFilter('home', 'sort', SORT_OPTIONS[0]);
 */
export function usePersistedFeedFilter<T>(
  feedType: FeedType,
  filterKey: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize from sessionStorage
  const [value, setValueInternal] = useState<T>(() => {
    return getFilterValue(feedType, filterKey, defaultValue);
  });
  
  // Custom setter that also persists to sessionStorage
  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValueInternal((prev) => {
      const resolvedValue = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev) 
        : newValue;
      
      // Persist to sessionStorage
      setFilterValue(feedType, filterKey, resolvedValue);
      
      return resolvedValue;
    });
  }, [feedType, filterKey]);
  
  return [value, setValue];
}

/**
 * Hook to get persisted content filters (ppv, w2e, locked) for a feed.
 * This is a convenience wrapper for the common content filters object pattern.
 * 
 * @param feedType - The feed this filter belongs to
 * @returns [filters, toggleFilter] - The filter state and a toggle function
 */
export function usePersistedContentFilters(
  feedType: FeedType
): [
  { ppv: boolean; w2e: boolean; locked: boolean },
  (filter: 'ppv' | 'w2e' | 'locked') => void,
  () => void
] {
  const defaultFilters = { ppv: false, w2e: false, locked: false };
  
  const [filters, setFilters] = usePersistedFeedFilter(
    feedType,
    'contentFilters',
    defaultFilters
  );
  
  const toggleFilter = useCallback((filter: 'ppv' | 'w2e' | 'locked') => {
    setFilters((prev) => ({ ...prev, [filter]: !prev[filter] }));
  }, [setFilters]);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [setFilters]);
  
  return [filters, toggleFilter, resetFilters];
}
