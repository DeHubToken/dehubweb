/**
 * Persisted Feed Filter Hook
 * ==========================
 * Persists feed filter states to sessionStorage so they survive navigation.
 * Uses a single storage key for all feed filter states.
 *
 * A toggle the viewer sets is also saved as their default (lib/feed-defaults,
 * on the account), so a new session opens with it until they reset toggles.
 * sessionStorage still wins inside a session; without an entry there the
 * saved default is used, then the feed's own default.
 * 
 * @module hooks/use-persisted-feed-filter
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { readFeedToggles, setFeedToggle, FEED_TOGGLES_RELOAD_EVENT } from '@/lib/feed-defaults';

// Single storage key for all feed filter states
const FEED_FILTERS_STORAGE_KEY = 'feed-filter-states';

type FeedType = 'home' | 'videos' | 'shorts' | 'images' | 'music' | 'live';

interface AllFeedFilters {
  home?: Record<string, unknown>;
  videos?: Record<string, unknown>;
  shorts?: Record<string, unknown>;
  images?: Record<string, unknown>;
  music?: Record<string, unknown>;
  live?: Record<string, unknown>;
}

/**
 * How an option object is named in storage. Sorts and dates carry a `value`;
 * duration buckets are named by their range (Infinity does not survive JSON,
 * so an open end is "inf" whether it reads back as Infinity or null).
 */
function optionKey(option: unknown): unknown {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return option;
  const o = option as Record<string, unknown>;
  if ('value' in o) return o.value;
  if ('min' in o && 'max' in o) {
    const max = o.max === Infinity || o.max == null ? 'inf' : o.max;
    return `${o.min}-${max}`;
  }
  return option;
}

/** Content chips are stored as the list switched on: {ppv:true} -> ['ppv']. */
function isFlagObject(v: unknown): v is Record<string, boolean> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'boolean');
}

function encode(value: unknown): unknown {
  if (isFlagObject(value)) return Object.keys(value).filter((k) => value[k]);
  return optionKey(value);
}

function decode<T>(stored: unknown, defaultValue: T, options?: readonly T[]): T {
  if (options) {
    const key = optionKey(stored);
    return options.find((o) => optionKey(o) === key) ?? defaultValue;
  }
  if (isFlagObject(defaultValue)) {
    if (Array.isArray(stored)) {
      const out = { ...defaultValue } as Record<string, boolean>;
      for (const k of Object.keys(out)) out[k] = stored.includes(k);
      return out as T;
    }
    return isFlagObject(stored) ? ({ ...defaultValue, ...stored } as T) : defaultValue;
  }
  // An option object saved by name but read without its list: keep the default.
  if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue) && (stored === null || typeof stored !== 'object')) {
    return defaultValue;
  }
  return stored as T;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(encode(a)) === JSON.stringify(encode(b));
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
function getFilterValue<T>(feedType: FeedType, filterKey: string, defaultValue: T, options?: readonly T[]): T {
  const allFilters = getAllFilters();
  const feedFilters = allFilters[feedType];
  
  if (feedFilters && filterKey in feedFilters) {
    return decode(feedFilters[filterKey], defaultValue, options);
  }

  const saved = readFeedToggles()[feedType];
  if (saved && filterKey in saved) {
    return decode(saved[filterKey], defaultValue, options);
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
  // Notify any listeners that feed filters changed
  window.dispatchEvent(new CustomEvent('feed-filters-changed'));
}

/**
 * Every toggle a feed currently has, by name, in its stored form (a sort or
 * date as its value, content chips as the list switched on). Session values
 * win over the saved defaults, the same order the feeds read them in. For code
 * that has to follow a feed's toggles without owning them, like feed search.
 */
export function readFeedFilterValues(feedType: FeedType): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(readFeedToggles()[feedType] ?? {}) };
  const session = getAllFilters()[feedType] ?? {};
  for (const [key, value] of Object.entries(session)) out[key] = encode(value);
  return out;
}

/** readFeedFilterValues, kept current as the feed's toggles change. */
export function useFeedFilterValues(feedType: FeedType): Record<string, unknown> {
  const [values, setValues] = useState(() => readFeedFilterValues(feedType));
  useEffect(() => {
    // The change event fires from inside the feed's state update, so read on
    // the next tick rather than setting state during another component's render.
    const reload = () => queueMicrotask(() => setValues(readFeedFilterValues(feedType)));
    setValues(readFeedFilterValues(feedType));
    window.addEventListener('feed-filters-changed', reload);
    window.addEventListener(FEED_TOGGLES_RELOAD_EVENT, reload);
    return () => {
      window.removeEventListener('feed-filters-changed', reload);
      window.removeEventListener(FEED_TOGGLES_RELOAD_EVENT, reload);
    };
  }, [feedType]);
  return values;
}

/**
 * Clear all persisted feed filters
 * Call this on explicit refresh (pull-to-refresh, home button double-click).
 * Saved default toggles stay; the feeds fall back to them.
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
 * @param options - For option objects (sorts, dates, durations): the list to
 *   map a stored value back onto, so a restored filter is the real option
 * @returns [value, setValue] tuple like useState
 * 
 * @example
 * const [selectedSort, setSelectedSort] = usePersistedFeedFilter('home', 'sort', SORT_OPTIONS[0]);
 */
export function usePersistedFeedFilter<T>(
  feedType: FeedType,
  filterKey: string,
  defaultValue: T,
  options?: readonly T[]
): [T, (value: T | ((prev: T) => T)) => void] {
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize from sessionStorage, then the saved default toggles
  const [value, setValueInternal] = useState<T>(() => {
    return getFilterValue(feedType, filterKey, defaultValue, options);
  });

  // Reset toggles (or the account's toggles arriving): read again.
  useEffect(() => {
    const reload = () => setValueInternal(getFilterValue(feedType, filterKey, defaultRef.current, optionsRef.current));
    window.addEventListener(FEED_TOGGLES_RELOAD_EVENT, reload);
    return () => window.removeEventListener(FEED_TOGGLES_RELOAD_EVENT, reload);
  }, [feedType, filterKey]);
  
  // Custom setter that also persists to sessionStorage and the saved defaults
  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValueInternal((prev) => {
      const resolvedValue = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev) 
        : newValue;
      
      // Persist to sessionStorage
      setFilterValue(feedType, filterKey, resolvedValue);
      setFeedToggle(
        feedType,
        filterKey,
        sameValue(resolvedValue, defaultRef.current) ? undefined : encode(resolvedValue),
      );
      
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
