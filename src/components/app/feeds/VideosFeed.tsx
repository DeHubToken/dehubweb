import { WindowedFeedItem } from '@/components/app/feeds/WindowedFeedItem';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { TranslationText } from '@/components/TranslationText';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Uses the unified /api/feed endpoint for server-side filtering.
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { toast } from 'sonner';
import { useTranslation as useI18n } from 'react-i18next';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from "lucide-react";
import RefreshCw from "@/components/ui/cut-icons/refresh";

import Play from "@/components/ui/cut-icons/play";
import ChevronRight from "@/components/ui/cut-icons/next";

import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AppState } from '@/components/app/AppState';
import { VideosFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { FeedFilterLoader } from '@/components/app/feeds/FeedFilterLoader';
import { useFeedFilterTransition } from '@/hooks/use-feed-filter-transition';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useScrollFadeMask } from '@/components/app/feeds/useScrollFadeMask';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ShortsReel } from '@/components/app/cards/ShortsReel';
import { uniqueShortsCreators } from '@/lib/shorts-rotation';
import { AutoplayVideo } from '@/components/app/AutoplayVideo';

import { useUnifiedFeed, mapToVideoItem, type UnifiedFeedParams, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { useAuth } from '@/contexts/AuthContext';
import { useHideWatched, useWatchedVideoIds } from '@/hooks/use-watched-videos';
import { useAppTheme } from '@/contexts/ThemeContext';
import { mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import { getMediaUrl, getCategories, type DeHubCategory, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl, buildHlsUrl } from '@/lib/media-url';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { SORT_OPTIONS, DEFAULT_FEED_SORT, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, type SortOption, type DateFilterOption, type ContentTypeFilters, type SortValue } from '@/lib/feed-utils';
import { usePersistedFeedFilter, usePersistedContentFilters, setFilterValue } from '@/hooks/use-persisted-feed-filter';
import type { ShortVideo, VideoItem } from '@/types/feed.types';

import { LIVE_GAMES } from '@/constants/live-games';
import { FEED_TOGGLES_RELOAD_EVENT } from '@/lib/feed-defaults';
import { resolveViewCount } from '@/lib/engagement';
import { toStoryboard } from '@/lib/storyboard';
import { storedVideoAspect } from '@/lib/video-aspect';
import { orderByInterests, useFeedInterests } from '@/lib/feed-interests';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
  refreshKey?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Sort options are imported from feed-utils

// Duration filters (client-side filtering)
const DURATION_FILTERS = [
  { label: 'Any', min: 0, max: Infinity },
  { get label() { return _translateCopy("copy.e8522fcb468a", { defaultValue: "< 1 min" }); }, min: 0, max: 60 },
  { get label() { return _translateCopy("copy.4650f53f370a", { defaultValue: "1-4 min" }); }, min: 60, max: 240 },
  { get label() { return _translateCopy("copy.1bf7f16a433b", { defaultValue: "4-20 min" }); }, min: 240, max: 1200 },
  { get label() { return _translateCopy("copy.cbc7e1eaa8b3", { defaultValue: "20+ min" }); }, min: 1200, max: Infinity },
];

// Upload date filters - imported from feed-utils for consistency

// Fallback categories if API fails
const FALLBACK_CATEGORIES: DeHubCategory[] = [
  { id: 'gaming', get name() { return _translateCopy("copy.0fadfa228814", { defaultValue: "Gaming" }); }, slug: 'gaming' },
  { id: 'music', get name() { return _translateCopy("copy.6eb00b4b2614", { defaultValue: "Music" }); }, slug: 'music' },
  { id: 'entertainment', get name() { return _translateCopy("copy.ceaa553e838f", { defaultValue: "Entertainment" }); }, slug: 'entertainment' },
  { id: 'education', get name() { return _translateCopy("copy.512ab3c6b986", { defaultValue: "Education" }); }, slug: 'education' },
  { id: 'crypto', get name() { return _translateCopy("copy.df12b8f89b61", { defaultValue: "Crypto" }); }, slug: 'crypto' },
  { id: 'programming', get name() { return _translateCopy("copy.e6aba2bd5a6b", { defaultValue: "Programming" }); }, slug: 'programming' },
];

const LIVE_CATEGORIES_INSERT_AFTER = 6;
const SHORTS_INSERT_AFTER = 10;

// Shared filter pill styles
function useActiveFilterClass() {
  const { theme, themeChoice } = useAppTheme();
  return (theme === 'light' || themeChoice === 'system-light')
    ? 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05)]'
    : 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';
}
const INACTIVE_FILTER_CLASS = 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
/** Number of pages to pre-fetch for random mode cross-page shuffling */
const RANDOM_PREFETCH_PAGES = 5;

// Helper to format counts
function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

// Parse duration string to seconds (e.g., "3:45" → 225, "1:02:30" → 3750)
function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  if (parts.length === 2) return parts[0] * 60 + parts[1]; // MM:SS
  return parts[0] || 0;
}

// ============================================================================
// API PARAMETER MAPPERS
// ============================================================================

/**
 * Map UI sort value to unified feed API sortBy parameter
 */
function getUnifiedSortBy(sortValue: SortValue): UnifiedFeedParams['sortBy'] {
  switch (sortValue) {
    case 'most-viewed':
      return 'views';
    case 'most-liked':
      return 'likes';
    case 'most-comments':
      return 'comments';
    case 'most-tipped':
      return 'tips';
    case 'random':
      return 'random';
    case 'following':
      return 'createdAt'; // Following sorts by newest, server filters by followed users
    case 'latest':
    default:
      return 'createdAt';
  }
}

/**
 * Map UI date filter to unified feed API range parameter
 */
function getUnifiedRange(dateValue: DateFilterOption['value']): UnifiedFeedParams['range'] | undefined {
  switch (dateValue) {
    case 'today':
      return 'day';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    case 'all':
    default:
      return undefined;
  }
}

// Parse timeAgo string to approximate Date (e.g., "2d ago" → Date 2 days ago)
function parseTimeAgoToDate(timeAgo: string): Date {
  const now = new Date();
  if (!timeAgo) return now;
  
  const match = timeAgo.match(/(\d+)\s*(m|h|d|w|mo|y)/i);
  if (!match) return now;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'm': return new Date(now.getTime() - value * 60 * 1000);
    case 'h': return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'w': return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case 'mo': return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    case 'y': return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000);
    default: return now;
  }
}


// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Live Categories Carousel - the same games as the Live tab. A tap opens the
// Live tab on that game; "See all" opens it on every stream.
function openLiveTab(gameId: string | null) {
  setFilterValue('live', 'category', gameId);
  // The Live feed may already be mounted; make it read the category again.
  window.dispatchEvent(new CustomEvent(FEED_TOGGLES_RELOAD_EVENT));
  window.dispatchEvent(new CustomEvent('switch-home-tab', { detail: 'live' }));
}

function LiveCategoriesCarousel() {
  const { t: _copy } = _useCopy();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span data-live-pulse className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />{_copy("copy.0bdcc439bd5f", { defaultValue: "Live Categories" })}</h3>
        <button onClick={() => openLiveTab(null)} className="text-red-400 text-sm hover:underline flex items-center gap-1">{_copy("copy.14c21c5e3ffe", { defaultValue: "See all " })}<ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide px-1">
          {LIVE_GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => openLiveTab(game.id)}
              className="flex-shrink-0 group"
            >
              <div className="w-36 sm:w-[10.5rem] overflow-hidden rounded-xl">
                <img 
                  src={game.image} 
                  alt={game.name}
                  loading="lazy"
                  className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>
              <p className="mt-1.5 text-left text-white text-xs font-medium truncate w-36 sm:w-[10.5rem]">{game.name}</p>
            </button>
          ))}
        </SwipeableCarousel>
      </div>
    </div>
  );
}

type DurationFilter = typeof DURATION_FILTERS[number];

// Sort Filter Section
function SortFilterSection({ selected, onSelect }: { selected: SortOption; onSelect: (o: SortOption) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.sort')}</span>
      <div className="relative">
        <GlassFilterRow
          items={SORT_OPTIONS.map((o) => ({ key: o.label, label: t(o.labelKey, o.label) }))}
          activeKey={selected.label}
          onSelect={(key) => { const o = SORT_OPTIONS.find(x => x.label === key); if (o) onSelect(o); }}
        />
      </div>
    </div>
  );
}

// Duration Filter Section
function DurationFilterSection({ selected, onSelect }: { selected: DurationFilter; onSelect: (o: DurationFilter) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.duration')}</span>
      <div className="relative">
        <GlassFilterRow
          items={DURATION_FILTERS.map((o) => ({ key: o.label, label: o.label === 'Any' ? t('filters.any') : o.label }))}
          activeKey={selected.label}
          onSelect={(key) => { const o = DURATION_FILTERS.find(x => x.label === key); if (o) onSelect(o); }}
        />
      </div>
    </div>
  );
}

// Upload Date Filter Section
function UploadDateFilterSection({ selected, onSelect }: { selected: DateFilterOption; onSelect: (o: DateFilterOption) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.uploadDate')}</span>
      <div className="relative">
        <GlassFilterRow
          items={DATE_FILTER_OPTIONS.map((o) => ({ key: o.label, label: o.value === 'all' ? t('filters.all') : o.label }))}
          activeKey={selected.label}
          onSelect={(key) => { const o = DATE_FILTER_OPTIONS.find(x => x.label === key); if (o) onSelect(o); }}
        />
      </div>
    </div>
  );
}

// Content Type Filter Section
function ContentTypeFilterSection({ 
  filters, 
  onToggle 
}: { 
  filters: ContentTypeFilters; 
  onToggle: (filter: keyof ContentTypeFilters) => void 
}) {
  const { t } = useI18n();
  const { ref: fadeRef, style: fadeStyle } = useScrollFadeMask<HTMLDivElement>();
  // A hook, so it is called once here rather than inside the branches and the
  // .map below — a per-item, per-condition hook call is a render-count crash
  // waiting for the number of active filters to change.
  const activeFilterClass = useActiveFilterClass();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
      <div className="relative">
        <div ref={fadeRef} className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'manipulation', ...fadeStyle }}>
          {CONTENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              data-feed-filter-button
              data-active={filters[filter.value] ? 'true' : undefined}
              onClick={() => onToggle(filter.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filters[filter.value]
                  ? activeFilterClass
                  : INACTIVE_FILTER_CLASS
              )}
            >
              {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Category Filter Section with search
function CategoryFilterSection({ 
  categories, 
  selectedCategory, 
  onSelect,
  isLoading 
}: { 
  categories: DeHubCategory[]; 
  selectedCategory: string | null; 
  onSelect: (cat: string | null) => void;
  isLoading?: boolean;
}) {
  const { t: _copy } = _useCopy();
  const { t } = useI18n();
  const [search, setSearch] = useSurfaceDraft("components/app/feeds/VideosFeed.tsx:search", '');
  const { ref: fadeRef, style: fadeStyle } = useScrollFadeMask<HTMLDivElement>();
  // Hoisted for the same reason as in ContentTypeFilterSection above.
  const activeFilterClass = useActiveFilterClass();

  const selectedObj = useMemo(() => {
    if (!selectedCategory) return null;
    return categories.find(c => c.id === selectedCategory) || null;
  }, [categories, selectedCategory]);

  const filtered = useMemo(() => {
    let list = categories;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    if (selectedObj) {
      list = list.filter(c => c.id !== selectedCategory);
    }
    return list;
  }, [categories, search, selectedCategory, selectedObj]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.category')}</span>
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          <span className="text-xs text-zinc-500 ml-2">{_copy("copy.d3cf16ece088", { defaultValue: "Loading categories..." })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.category')}</span>
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('filters.searchCategories')}
        className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-200 placeholder-zinc-500 border border-zinc-700 focus:border-zinc-500 focus:outline-none transition-colors mb-1"
      />
      <div className="relative">
        <div ref={fadeRef} className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'manipulation', ...fadeStyle }}>
          {selectedObj && (
            <button
              data-feed-filter-button
              data-active="true"
              onClick={() => { onSelect(null); setSearch.complete(search, ''); }}
              className={cn("flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all", activeFilterClass)}
            >
              {selectedObj.name}
              <span className="ml-0.5 text-white/50 hover:text-white">✕</span>
            </button>
          )}
          <button
            data-feed-filter-button
            data-active={selectedCategory === null ? 'true' : undefined}
            onClick={() => { onSelect(null); setSearch.complete(search, ''); }}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              selectedCategory === null ? activeFilterClass : INACTIVE_FILTER_CLASS
            )}
          >
            {t('filters.all')}
          </button>
          {filtered.map((cat) => (
            <button
              key={cat.id}
              data-feed-filter-button
              data-active={selectedCategory === cat.id ? 'true' : undefined}
              onClick={() => { onSelect(cat.id); setSearch.complete(search, ''); }}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selectedCategory === cat.id ? activeFilterClass : INACTIVE_FILTER_CLASS
              )}
            >
              {cat.name}
            </button>
          ))}
          {filtered.length === 0 && search.trim() && (
            <span className="text-xs text-zinc-500 py-1.5">{t('filters.noMatches')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false, refreshKey = 0 }: VideosFeedProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isCollapsed } = useSidebarCollapse();
  const { isAuthenticated } = useAuth();
  // Hoisted: useActiveFilterClass reads theme context, so it has to be called
  // unconditionally at the top, never inside a branch or a .map callback.
  const activeFilterClass = useActiveFilterClass();
  
  // Sort is now client-side - default to "Latest" for instant loading - persisted to sessionStorage
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('videos', 'sort', DEFAULT_FEED_SORT, SORT_OPTIONS);
  // Duration and upload date are client-side filters - persisted
  const [selectedDuration, setSelectedDuration] = usePersistedFeedFilter<typeof DURATION_FILTERS[number]>('videos', 'duration', DURATION_FILTERS[0], DURATION_FILTERS);
  const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter<DateFilterOption>('videos', 'date', DATE_FILTER_OPTIONS[0], DATE_FILTER_OPTIONS);
  const [selectedCategory, setSelectedCategory] = usePersistedFeedFilter<string | null>('videos', 'category', null);
  const [contentFilters, toggleContentFilter, resetContentFilters] = usePersistedContentFilters('videos');
  // Hide watched sticks across sessions (localStorage, not the session-scoped
  // filter store) — it is a standing preference, not a filter you set once.
  // Owned by Settings → Content, not by this panel: it is a standing viewing
  // preference rather than a filter you set for one visit.
  const [hideWatched] = useHideWatched();
  const { watchedIds } = useWatchedVideoIds(hideWatched);
  const { ref: fadeRef, style: fadeStyle } = useScrollFadeMask<HTMLDivElement>();
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Filter chips arm a loader on click so a sort switch never leaves the old
  // results sitting there looking frozen (the feed query keeps previous data).
  // The hook that owns it needs `isFetching` from the query below, so a ref
  // bridges the gap — a click can't land before the effect that fills it.
  const beginFilterTransitionRef = useRef<() => void>(() => {});
  const beginFilterTransition = useCallback(() => {
    beginFilterTransitionRef.current();
  }, []);

  // Staged autoplay: first only 1 video, then expand to 3 after initial render
  const [autoplayLimit, setAutoplayLimit] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => setAutoplayLimit(3), 800);
    return () => clearTimeout(timer);
  }, []);

  // Auth-guarded sort selection
  const handleSortSelect = useCallback((option: SortOption) => {
    if (option.value === 'following' && !isAuthenticated) {
      toast.info(_copy("copy.c32690bd04d1", { defaultValue: "Log in to see followed creators" }));
      return;
    }
    // Re-tapping the active chip changes nothing, so it must not flash a loader.
    if (option.value === selectedSort.value) return;
    beginFilterTransition();
    setSelectedSort(option);
  }, [isAuthenticated, selectedSort.value, setSelectedSort, beginFilterTransition, _copy]);

  // Every other chip row goes through these, so each one arms the loader.
  const selectCategory = useCallback((value: string | null) => {
    beginFilterTransition();
    setSelectedCategory(value);
  }, [setSelectedCategory, beginFilterTransition]);
  const selectDuration = useCallback((value: typeof DURATION_FILTERS[number]) => {
    beginFilterTransition();
    setSelectedDuration(value);
  }, [setSelectedDuration, beginFilterTransition]);
  const selectUploadDate = useCallback((value: DateFilterOption) => {
    beginFilterTransition();
    setSelectedUploadDate(value);
  }, [setSelectedUploadDate, beginFilterTransition]);
  const selectContentFilter = useCallback((value: 'ppv' | 'w2e' | 'locked') => {
    beginFilterTransition();
    toggleContentFilter(value);
  }, [toggleContentFilter, beginFilterTransition]);
  const resetAllFilters = useCallback(() => {
    beginFilterTransition();
    setSelectedSort(DEFAULT_FEED_SORT);
    setSelectedCategory(null);
    setSelectedDuration(DURATION_FILTERS[0]);
    setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
    resetContentFilters();
  }, [setSelectedSort, setSelectedCategory, setSelectedDuration, setSelectedUploadDate, resetContentFilters, beginFilterTransition]);

  // Topics picked while signing up go first in every category bar.
  const feedInterests = useFeedInterests();
  const putInterestsFirst = useCallback((list: DeHubCategory[]) => orderByInterests(list, feedInterests), [feedInterests]);
  // Fetch categories from API
  const { data: apiCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    select: putInterestsFirst,
    staleTime: 1000 * 60 * 30,
    retry: 2,
    enabled: showFilters,
  });

  // Use API categories with fallback
  const categories = useMemo(() => {
    if (apiCategories && Array.isArray(apiCategories) && apiCategories.length > 0) {
      return apiCategories;
    }
    return FALLBACK_CATEGORIES;
  }, [apiCategories]);

  // For "Most Liked", ignore date filter to get true all-time ranking (matches Home feed behavior)
  const effectiveRange = useMemo(() => {
    if (selectedSort.value === 'most-liked' || selectedSort.value === 'random' || selectedSort.value === 'following') {
      return undefined; // No range limit for global ranking / random / following
    }
    return getUnifiedRange(selectedUploadDate.value);
  }, [selectedSort.value, selectedUploadDate.value]);

  const hasContentFilter = contentFilters.ppv || contentFilters.w2e || contentFilters.locked;

  // Use unified feed with server-side PPV/Bounty/Locked filtering
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isFetching: isApiFetching,
    isError,
    refetch,
  } = useUnifiedFeed({
    limit: 12,
    postType: hasContentFilter ? undefined : 'video',
    sortBy: getUnifiedSortBy(selectedSort.value),
    sortOrder: 'desc',
    range: effectiveRange,
    isPPV: contentFilters.ppv || undefined,
    hasBounty: contentFilters.w2e || undefined,
    isLocked: contentFilters.locked || undefined,
    status: 'all',
    followingOnly: selectedSort.value === 'following' ? true : undefined,
  });

  const filterTransition = useFeedFilterTransition(isApiFetching);
  useEffect(() => {
    beginFilterTransitionRef.current = filterTransition.begin;
  }, [filterTransition.begin]);

  // Fetch shorts for the carousel using unified feed (same approach as HomeFeed)
  const scrollFeed = useUnifiedFeed({
    limit: 10,
    postType: 'video',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    status: 'all',
  });

  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Get all unified feed items
  const allFeedItems = useMemo((): UnifiedFeedItem[] => {
    if (!apiData?.pages) return [];
    return apiData.pages.flatMap(page => page.items || []);
  }, [apiData]);

  // Map unified feed items to video items (server-side filtering handles PPV/Bounty/Locked)
  const allVideos = useMemo(() => {
    return allFeedItems.map((item, index) => mapToVideoItem(item, index));
  }, [allFeedItems]);

  // Apply client-side duration + watched filters
  const videos = useMemo((): VideoItem[] => {
    let filtered = allVideos;

    // Duration filter
    if (selectedDuration.max !== Infinity || selectedDuration.min !== 0) {
      filtered = filtered.filter(video => {
        const secs = parseDurationToSeconds(video.duration);
        return secs >= selectedDuration.min && secs < selectedDuration.max;
      });
    }

    // Already-played videos. Client-side because the feed API has no notion of
    // who watched what — the watch history is its own endpoint.
    if (hideWatched && watchedIds.size > 0) {
      filtered = filtered.filter(video => !watchedIds.has(String(video.id)));
    }

    return filtered;
  }, [allVideos, selectedDuration, hideWatched, watchedIds]);

  // Auto-fetch more pages when duration filter reduces visible items below threshold
  const MIN_VISIBLE_VIDEOS = 8;
  const MAX_AUTO_FETCH_ATTEMPTS = 5;
  const autoFetchAttempts = useRef(0);

  // Reset auto-fetch attempts when a client-side filter changes
  useEffect(() => {
    autoFetchAttempts.current = 0;
  }, [selectedDuration, hideWatched]);

  useEffect(() => {
    const isDurationFilterActive = selectedDuration.min !== 0 || selectedDuration.max !== Infinity;
    // Hiding watched thins a page the same way a duration filter does, so it
    // needs the same top-up or the feed can come back looking empty.
    const isClientFilterActive = isDurationFilterActive || (hideWatched && watchedIds.size > 0);

    if (
      isClientFilterActive &&
      videos.length < MIN_VISIBLE_VIDEOS &&
      hasNextPage &&
      autoFetchAttempts.current < MAX_AUTO_FETCH_ATTEMPTS &&
      !isFetchingNextPage &&
      !isApiLoading
    ) {
      console.log(`[VideosFeed] Auto-fetching more pages. Current: ${videos.length} videos, need ${MIN_VISIBLE_VIDEOS}`);
      autoFetchAttempts.current += 1;
      fetchNextPage();
    }
    
    // Reset attempts when filter is removed
    if (!isClientFilterActive) {
      autoFetchAttempts.current = 0;
    }
  }, [videos.length, selectedDuration, hideWatched, watchedIds, hasNextPage, isFetchingNextPage, isApiLoading, fetchNextPage]);

  // Check if we're auto-fetching to fill the view
  const isAutoFetching =
    (selectedDuration.min !== 0 || selectedDuration.max !== Infinity || (hideWatched && watchedIds.size > 0)) &&
    videos.length < MIN_VISIBLE_VIDEOS &&
    (isFetchingNextPage || (hasNextPage && autoFetchAttempts.current < MAX_AUTO_FETCH_ATTEMPTS));

  // Map shorts data (same mapping as HomeFeed)
  const shorts = useMemo((): ShortVideo[] => {
    if (!scrollFeed.data?.pages) return [];
    const allItems = scrollFeed.data.pages.flatMap(page => page.items || []);
    // Exclude PPV content from shorts carousels
    const nonPPV = allItems.filter(item => !item.streamInfo?.isPayPerView);
    return uniqueShortsCreators(nonPPV).slice(0, 10).map((item) => {
      const id = String(item.tokenId);
      const minterAddress = item.minter || '';
      const voteType = (item as any).voteType ?? (item as any).userVote ?? (item as any).myVote ?? null;
      const avatarUrl = item.minterAvatarUrl
        ? (item.minterAvatarUrl.startsWith('http') ? item.minterAvatarUrl : buildAvatarUrl(minterAddress, item.minterAvatarUrl))
        : undefined;

      return {
        id,
        type: 'short' as const,
        username: item.minterDisplayName || item.minterUsername || 'user',
        verified: (item as any).minterUser?.isVerified || false,
        avatar: avatarUrl || undefined,
        likes: String(item.totalVotes?.for || 0),
        dislikes: item.totalVotes?.against || 0,
        thumbnail: getMediaUrl(item.imageUrl) || '',
        videoUrl: item.videoUrl
          ? (item.videoUrl.startsWith('http') ? item.videoUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${item.videoUrl}`)
          : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${id}.mp4`,
        hlsUrl: buildHlsUrl(item.hlsUrl),
        transcodingStatus: item.transcodingStatus,
        storyboard: toStoryboard(item.storyboard),
        storedAspect: storedVideoAspect(item.videoInfo),
        // Both, not one: the caption usually lives in the title, and a short
        // that carried a title AND a description only ever showed the second.
        title: item.name || '',
        description: item.description || '',
        sound: _translateCopy("copy.9ef6cdcd044c", { defaultValue: "Original Sound" }),
        comments: formatCount(item.commentCount || 0),
        shares: '0',
        repostCount: ((item as any).totalReposts || (item as any).reposts || 0) + ((item as any).quotes || 0),
        views: formatCount(resolveViewCount(item)),
        creatorUsername: item.minterUsername || 'user',
        creatorId: minterAddress,
        displayName: item.minterDisplayName || undefined,
        isLiked: (item as any).isLiked ?? voteType === 'for',
        isDisliked: (item as any).isDisliked ?? voteType === 'against',
      };
    });
  }, [scrollFeed.data]);

  // Check if any client-side filters are active
  const hasActiveFilters = selectedDuration.label !== 'Any' || selectedUploadDate.value !== 'all' || contentFilters.ppv || contentFilters.w2e || contentFilters.locked;

  // Infinite scroll observer - uses ref-based guard to prevent race conditions
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Use ref for synchronous check - prevents multiple fetches from stale closures
        if (entries[0].isIntersecting && hasNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Reset client-side filters to defaults
  const clearFilters = () => {
    selectDuration(DURATION_FILTERS[0]);
    selectUploadDate(DATE_FILTER_OPTIONS[0]);
  };

  const EmptyState = () => (
    <AppState
      icon={isError ? 'notifications' : 'videos'}
      title={isError ? _translateCopy("copy.7824c7c065f6", { defaultValue: "Videos could not load" }) : _translateCopy("copy.7b1fd32345ce", { defaultValue: "No videos yet" })}
      description={isError ? _translateCopy("copy.65998993506d", { defaultValue: "Try loading the video feed again." }) : _translateCopy("copy.906275cbc53f", { defaultValue: "Video posts will appear here." })}
      kind={isError ? 'error' : 'empty'}
      size="page"
      primaryAction={isError ? { get label() { return _translateCopy("copy.d8b8392e2c54", { defaultValue: "Try again" }); }, onClick: () => refetch(), icon: <RefreshCw /> } : undefined}
    />
  );

  // Filtered empty state (when filters return no results but API has data)
  const FilteredEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <ThemedIcon icon="search" alt="" className="w-12 h-12 object-contain mb-3 opacity-65" />
      <h3 className="text-white font-semibold mb-1"><TranslationText name="copy.2df01a03ff43" fallback={"No matches"} /></h3>
      <p className="text-zinc-400 text-sm mb-3"><TranslationText name="copy.4d765c1adda1" fallback={"Try adjusting your filters"} /></p>
      <button 
        onClick={clearFilters}
        className="text-sm text-white/70 hover:text-white underline"
      ><TranslationText name="copy.7179ea0035fc" fallback={"Clear filters"} /></button>
    </div>
  );

  const { isAutoRetrying } = useAutoRetryFeed({
    itemCount: allVideos.length,
    // An in-flight filter switch is not an empty feed — without this the retry
    // loop fires against the results the user is already waiting for.
    isLoading: isApiLoading || filterTransition.active,
    isError,
    refetch,
  });

  // Show loading during initial load or while auto-fetching for duration filter.
  // A pull-to-refresh keeps the cards on screen while the fresh page loads.
  if ((isApiLoading || isAutoFetching || isAutoRetrying) && !showFilters) {
    return (
      <div className="p-2 sm:p-3 pt-0 sm:pt-0">
        <VideosFeedSkeleton />
      </div>
    );
  }

  return (
    <div data-feed-root className="p-2 sm:p-3 pt-0 sm:pt-0">
      {/* Filters */}
      <AnimatePresence mode="wait">
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-y-clip overflow-x-visible"
          >
            <div data-no-swipe data-feed-filter-panel className="relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-2 sm:px-3 py-3 space-y-4">
              <SortFilterSection selected={selectedSort} onSelect={handleSortSelect} />
              <CategoryFilterSection 
                categories={categories} 
                selectedCategory={selectedCategory} 
                onSelect={selectCategory}
                isLoading={categoriesLoading}
              />
              <DurationFilterSection selected={selectedDuration} onSelect={selectDuration} />
              <UploadDateFilterSection selected={selectedUploadDate} onSelect={selectUploadDate} />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
                <div className="relative">
                  <div ref={fadeRef} className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'manipulation', ...fadeStyle }}>
                    {CONTENT_TYPE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => selectContentFilter(filter.value)}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          contentFilters[filter.value]
                            ? activeFilterClass
                            : INACTIVE_FILTER_CLASS
                        )}
                      >
                        {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Reset filters - bottom right */}
              <button
                onClick={resetAllFilters}
                className="absolute z-50 bottom-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label={t('filters.resetFilters')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* Video Grid, filter loader or Empty State. The loader sits BELOW the
          filter panel, not in place of the whole feed, so the chips the user is
          working with stay on screen and clickable while the request runs. */}
      {isApiLoading || isAutoFetching || isAutoRetrying ? (
        <VideosFeedSkeleton />
      ) : filterTransition.active ? (
        <FeedFilterLoader className="mt-3" />
      ) : allVideos.length === 0 ? (
        <EmptyState />
      ) : videos.length === 0 && hasActiveFilters ? (
        <FilteredEmptyState />
      ) : (
        <div key={`${selectedSort.value}-${selectedUploadDate.value}`}>
          <div className={cn("space-y-5", isCollapsed && "sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0")}>
            {/* Skip first 3 videos ONLY if featured row is shown (only for "Latest" sort), then insert carousels at intervals */}
            {(videos.length >= 3 && selectedSort.value === 'latest' ? videos.slice(3) : videos).map((video, index) => {
              const elements: React.ReactNode[] = [];
              
              // Add video card wrapped in bento container
              elements.push(
                <WindowedFeedItem
                  key={video.id}
                  data-feed-item
                  data-feed-before-shorts={index === SHORTS_INSERT_AFTER - 1 && shorts.length > 0 ? '' : undefined}
                  data-feed-after-shorts={index === SHORTS_INSERT_AFTER && shorts.length > 0 ? '' : undefined}
                  data-cinematic="video"
                  data-cinematic-first={index === 0 ? '' : undefined}
                  className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3"
                  eager={index < 3} estimatedHeight={520}
                  vanishOnDislike={video.id}
                >
                  <VideoCard video={video} />
                </WindowedFeedItem>
              );
              
              // Insert live categories carousel after 6 posts (index 5, since 0-indexed)
              if (index === LIVE_CATEGORIES_INSERT_AFTER - 1) {
                elements.push(
                  <div key="live-categories-carousel" className={cn(isCollapsed && "sm:col-span-2")}>
                    <LiveCategoriesCarousel />
                  </div>
                );
              }
              
              // Insert shorts carousel after 10 posts (index 9)
              if (index === SHORTS_INSERT_AFTER - 1 && shorts.length > 0) {
                elements.push(<div key="shorts-carousel" className={cn(isCollapsed && "sm:col-span-2")}><ShortsReel shorts={shorts} /></div>);
              }
              
              return elements;
            })}
          </div>

          {/* Infinite scroll loader */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{t('common.loadingMore')}</span>
              </div>
            )}
            {!hasNextPage && videos.length > 0 && (
              <p className="text-zinc-500 text-sm">{_copy("copy.4020afe05053", { defaultValue: "You've reached the end 🎉" })}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
