/**
 * Feed search
 * ===========
 * Tapping the lit tab in the feed pill turns the pill into a search box for
 * that feed (Home, Shorts, Images, Videos, Music). One open/query state is shared by
 * the pill and the results, so this is a tiny store rather than context: the
 * pill lives in HomePage and in GlobalFeedNav, the results inside each feed.
 *
 * Results follow the same toggles as the feed under them. feedSearchParams
 * turns a feed's stored toggles (readFeedFilterValues) into /api/feed params.
 *
 * @module lib/feed-search
 */
import { useSyncExternalStore } from 'react';
import type { UnifiedFeedParams } from '@/hooks/use-unified-feed';

export const FEED_SEARCH_TABS = ['home', 'shorts', 'images', 'videos', 'music'] as const;
export type FeedSearchTab = typeof FEED_SEARCH_TABS[number];

export function isFeedSearchTab(tab: string | null | undefined): tab is FeedSearchTab {
  return !!tab && (FEED_SEARCH_TABS as readonly string[]).includes(tab);
}

interface FeedSearchState {
  open: boolean;
  query: string;
}

let state: FeedSearchState = { open: false, query: '' };
const listeners = new Set<() => void>();

function set(next: FeedSearchState) {
  if (next.open === state.open && next.query === state.query) return;
  state = next;
  listeners.forEach((l) => l());
}

export function openFeedSearch() {
  set({ open: true, query: state.query });
}

/** Closing also forgets the words, so the next open starts empty. */
export function closeFeedSearch() {
  set({ open: false, query: '' });
}

export function setFeedSearchQuery(query: string) {
  set({ open: true, query });
}

export function getFeedSearchState(): FeedSearchState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeedSearch(): FeedSearchState {
  return useSyncExternalStore(subscribe, getFeedSearchState, getFeedSearchState);
}

/** The words to search with, or '' while the box is closed or blank. */
export function activeFeedSearchQuery(s: FeedSearchState): string {
  return s.open ? s.query.trim() : '';
}

const FEED_POST_TYPE: Record<Exclude<FeedSearchTab, 'home'>, UnifiedFeedParams['postType']> = {
  shorts: 'short',
  images: 'feed-images',
  videos: 'video',
  music: 'feed-audio',
};

const SORT_BY: Record<string, UnifiedFeedParams['sortBy']> = {
  'most-viewed': 'views',
  'most-liked': 'likes',
  'most-comments': 'comments',
  'most-tipped': 'tips',
  random: 'random',
  discovery: 'score',
};

const RANGE: Record<string, UnifiedFeedParams['range']> = {
  today: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/** Sorts that rank across all time, so the feeds drop the date toggle for them. */
const ALL_TIME_SORTS = new Set(['most-liked', 'random', 'following']);

function flags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (value && typeof value === 'object') return Object.entries(value).filter(([, on]) => on === true).map(([k]) => k);
  return [];
}

/**
 * /api/feed params for a search in `tab`, using that feed's toggles. Toggles a
 * search can't use (shorts duration, music chart sub-tabs) are ignored.
 */
export function feedSearchParams(
  tab: FeedSearchTab,
  filters: Record<string, unknown>,
  query: string,
): Omit<UnifiedFeedParams, 'page' | 'limit'> {
  const sort = typeof filters.sort === 'string' ? filters.sort : '';
  const date = typeof filters.date === 'string' ? filters.date : 'all';
  const content = flags(filters.contentFilters);

  let postType: UnifiedFeedParams['postType'];
  let category: string | undefined;
  if (tab === 'home') {
    const pt = filters.postType;
    postType = typeof pt === 'string' && pt !== 'all' ? (pt as UnifiedFeedParams['postType']) : undefined;
    const cats = Array.isArray(filters.categories) ? filters.categories.filter((c): c is string => typeof c === 'string') : [];
    category = cats.length === 1 ? cats[0] : undefined;
  } else if (tab === 'music' && filters.subTab === 'videos') {
    // The Music tab's Music Videos chart: videos posted in the Music category.
    postType = 'video';
    category = 'Music';
  } else {
    postType = FEED_POST_TYPE[tab];
    category = typeof filters.category === 'string' && filters.category ? filters.category : undefined;
  }

  return {
    search: query,
    postType,
    category,
    sortBy: SORT_BY[sort] ?? 'createdAt',
    sortOrder: 'desc',
    range: ALL_TIME_SORTS.has(sort) ? undefined : RANGE[date],
    isPPV: content.includes('ppv') || undefined,
    hasBounty: content.includes('w2e') || undefined,
    isLocked: content.includes('locked') || undefined,
    followingOnly: sort === 'following' || undefined,
    status: 'all',
  };
}
