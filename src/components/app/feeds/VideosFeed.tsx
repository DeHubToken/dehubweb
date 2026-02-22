/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Uses the unified /api/feed endpoint for server-side filtering.
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation as useI18n } from 'react-i18next';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Video, Play, ChevronRight, Filter, Radio, Eye, Loader2 } from 'lucide-react';
import { VideosFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AnimatedFilterPill } from '@/components/app/feeds/AnimatedFilterPill';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ShortsReel } from '@/components/app/cards/ShortsReel';

import { useUnifiedFeed, mapToVideoItem, type UnifiedFeedParams, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { useAuth } from '@/contexts/AuthContext';
import { mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import { getMediaUrl, getCategories, type DeHubCategory, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, type SortOption, type DateFilterOption, type ContentTypeFilters, type SortValue } from '@/lib/feed-utils';
import { usePersistedFeedFilter, usePersistedContentFilters } from '@/hooks/use-persisted-feed-filter';
import type { ShortVideo, VideoItem } from '@/types/feed.types';

// Category images
import minecraftCategory from '@/assets/minecraft-category.png';
import codCategory from '@/assets/cod-category.png';
import gtaCategory from '@/assets/gta-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import apexCategory from '@/assets/apex-category.png';
import justchattingCategory from '@/assets/justchatting-category.png';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Sort options are imported from feed-utils

// Duration filters (client-side filtering)
const DURATION_FILTERS = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '< 1 min', min: 0, max: 60 },
  { label: '1-4 min', min: 60, max: 240 },
  { label: '4-20 min', min: 240, max: 1200 },
  { label: '20+ min', min: 1200, max: Infinity },
];

// Upload date filters - imported from feed-utils for consistency

// Fallback categories if API fails
const FALLBACK_CATEGORIES: DeHubCategory[] = [
  { id: 'gaming', name: 'Gaming', slug: 'gaming' },
  { id: 'music', name: 'Music', slug: 'music' },
  { id: 'entertainment', name: 'Entertainment', slug: 'entertainment' },
  { id: 'education', name: 'Education', slug: 'education' },
  { id: 'crypto', name: 'Crypto', slug: 'crypto' },
  { id: 'programming', name: 'Programming', slug: 'programming' },
];

const LIVE_CATEGORIES_INSERT_AFTER = 5;
const SHORTS_INSERT_AFTER = 9;

// Shared filter pill styles
const ACTIVE_FILTER_CLASS = 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';
const INACTIVE_FILTER_CLASS = 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
/** Number of pages to pre-fetch for random mode cross-page shuffling */
const RANDOM_PREFETCH_PAGES = 5;

const LIVE_CATEGORIES = [
  { name: 'Just Chatting', streams: 0, viewers: 0, image: justchattingCategory },
  { name: 'Fortnite', streams: 0, viewers: 0, image: fortniteCategory },
  { name: 'Valorant', streams: 0, viewers: 0, image: valorantCategory },
  { name: 'Minecraft', streams: 0, viewers: 0, image: minecraftCategory },
  { name: 'League of Legends', streams: 0, viewers: 0, image: leagueCategory },
  { name: 'Call of Duty', streams: 0, viewers: 0, image: codCategory },
  { name: 'GTA V', streams: 0, viewers: 0, image: gtaCategory },
  { name: 'Apex Legends', streams: 0, viewers: 0, image: apexCategory },
];

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

// Live Categories Carousel - consistent format with LiveFeed
function LiveCategoriesCarousel() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Live Categories
        </h3>
        <button className="text-red-400 text-sm hover:underline flex items-center gap-1">
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide px-1">
          {LIVE_CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              className="flex-shrink-0 group"
            >
              <div className="w-36 sm:w-[10.5rem] overflow-hidden rounded-xl">
                <img 
                  src={cat.image} 
                  alt={cat.name}
                  className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-200"
                />
              </div>
              <div className="mt-1.5 text-left">
                <p className="text-white text-xs font-medium truncate w-36 sm:w-[10.5rem]">{cat.name}</p>
                <div className="flex items-center gap-2 text-zinc-500 text-xs">
                  <span className="flex items-center gap-0.5">
                    <Radio className="w-3 h-3" />
                    {cat.streams}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {cat.viewers}
                  </span>
                </div>
              </div>
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
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
          {SORT_OPTIONS.map((option) => (
            <AnimatedFilterPill
              key={option.label}
              layoutId="videos-sort"
              isActive={selected.label === option.label}
              onClick={() => onSelect(option)}
            >
              {t(`filters.${option.value === 'most-viewed' ? 'mostViewed' : option.value === 'most-liked' ? 'mostLiked' : option.value === 'most-comments' ? 'mostComments' : option.value}`, option.label)}
            </AnimatedFilterPill>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
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
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
          {DURATION_FILTERS.map((option) => (
            <AnimatedFilterPill
              key={option.label}
              layoutId="videos-duration"
              isActive={selected.label === option.label}
              onClick={() => onSelect(option)}
            >
              {option.label === 'Any' ? t('filters.any') : option.label}
            </AnimatedFilterPill>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
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
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
          {DATE_FILTER_OPTIONS.map((option) => (
            <AnimatedFilterPill
              key={option.label}
              layoutId="videos-date"
              isActive={selected.label === option.label}
              onClick={() => onSelect(option)}
            >
              {option.value === 'all' ? t('filters.all') : option.label}
            </AnimatedFilterPill>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
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
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
          {CONTENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onToggle(filter.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filters[filter.value]
                  ? ACTIVE_FILTER_CLASS
                  : INACTIVE_FILTER_CLASS
              )}
            >
              {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
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
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  
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
          <span className="text-xs text-zinc-500 ml-2">Loading categories...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.category')}</span>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('filters.searchCategories')}
        className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-200 placeholder-zinc-500 border border-zinc-700 focus:border-zinc-500 focus:outline-none transition-colors mb-1"
      />
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
          {selectedObj && (
            <button
              onClick={() => { onSelect(null); setSearch(''); }}
              className={cn("flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all", ACTIVE_FILTER_CLASS)}
            >
              {selectedObj.name}
              <span className="ml-0.5 text-white/50 hover:text-white">✕</span>
            </button>
          )}
          <button
            onClick={() => { onSelect(null); setSearch(''); }}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              selectedCategory === null ? ACTIVE_FILTER_CLASS : INACTIVE_FILTER_CLASS
            )}
          >
            {t('filters.all')}
          </button>
          {filtered.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { onSelect(cat.id); setSearch(''); }}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selectedCategory === cat.id ? ACTIVE_FILTER_CLASS : INACTIVE_FILTER_CLASS
              )}
            >
              {cat.name}
            </button>
          ))}
          {filtered.length === 0 && search.trim() && (
            <span className="text-xs text-zinc-500 py-1.5">{t('filters.noMatches')}</span>
          )}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: VideosFeedProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  
  // Sort is now client-side - default to "Latest" for instant loading - persisted to sessionStorage
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('videos', 'sort', SORT_OPTIONS[0]);
  // Duration and upload date are client-side filters - persisted
  const [selectedDuration, setSelectedDuration] = usePersistedFeedFilter<typeof DURATION_FILTERS[number]>('videos', 'duration', DURATION_FILTERS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter<DateFilterOption>('videos', 'date', DATE_FILTER_OPTIONS[0]);
  const [selectedCategory, setSelectedCategory] = usePersistedFeedFilter<string | null>('videos', 'category', null);
  const [contentFilters, toggleContentFilter, resetContentFilters] = usePersistedContentFilters('videos');
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Auth-guarded sort selection
  const handleSortSelect = useCallback((option: SortOption) => {
    if (option.value === 'subscribed') {
      toast.info('Subscribed feed coming soon!');
      return;
    }
    if (option.value === 'following' && !isAuthenticated) {
      toast.info('Log in to see followed creators');
      return;
    }
    setSelectedSort(option);
  }, [isAuthenticated, setSelectedSort]);

  // Fetch categories from API
  const { data: apiCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
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
    status: 'minted',
    followingOnly: selectedSort.value === 'following' ? true : undefined,
  });

  // Fetch shorts for the carousel using unified feed (same approach as HomeFeed)
  const scrollFeed = useUnifiedFeed({
    limit: 10,
    postType: 'video',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    status: 'minted',
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

  // Apply client-side duration filter
  const videos = useMemo((): VideoItem[] => {
    // Duration filter
    if (selectedDuration.max !== Infinity || selectedDuration.min !== 0) {
      return allVideos.filter(video => {
        const secs = parseDurationToSeconds(video.duration);
        return secs >= selectedDuration.min && secs < selectedDuration.max;
      });
    }
    
    return allVideos;
  }, [allVideos, selectedDuration]);

  // Auto-fetch more pages when duration filter reduces visible items below threshold
  const MIN_VISIBLE_VIDEOS = 8;
  const MAX_AUTO_FETCH_ATTEMPTS = 5;
  const autoFetchAttempts = useRef(0);

  // Reset auto-fetch attempts when duration filter changes
  useEffect(() => {
    autoFetchAttempts.current = 0;
  }, [selectedDuration]);

  useEffect(() => {
    const isDurationFilterActive = selectedDuration.min !== 0 || selectedDuration.max !== Infinity;
    
    if (
      isDurationFilterActive &&
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
    if (!isDurationFilterActive) {
      autoFetchAttempts.current = 0;
    }
  }, [videos.length, selectedDuration, hasNextPage, isFetchingNextPage, isApiLoading, fetchNextPage]);

  // Check if we're auto-fetching to fill the view
  const isAutoFetching = 
    (selectedDuration.min !== 0 || selectedDuration.max !== Infinity) &&
    videos.length < MIN_VISIBLE_VIDEOS &&
    (isFetchingNextPage || (hasNextPage && autoFetchAttempts.current < MAX_AUTO_FETCH_ATTEMPTS));

  // Map shorts data (same mapping as HomeFeed)
  const shorts = useMemo((): ShortVideo[] => {
    if (!scrollFeed.data?.pages) return [];
    const allItems = scrollFeed.data.pages.flatMap(page => page.items || []);
    // Exclude PPV content from shorts carousels
    const nonPPV = allItems.filter(item => !item.streamInfo?.isPayPerView);
    return nonPPV.slice(0, 10).map((item) => {
      const id = String(item.tokenId);
      const minterAddress = item.minter || '';
      const avatarUrl = item.minterAvatarUrl
        ? (item.minterAvatarUrl.startsWith('http') ? item.minterAvatarUrl : buildAvatarUrl(minterAddress, item.minterAvatarUrl))
        : undefined;

      return {
        id,
        type: 'short' as const,
        username: item.minterDisplayName || item.minterUsername || 'user',
        verified: (item as any).minterUser?.isVerified || false,
        avatar: avatarUrl || (minterAddress ? `https://api.dicebear.com/7.x/identicon/svg?seed=${minterAddress}` : undefined),
        likes: String(item.totalVotes?.for || 0),
        thumbnail: getMediaUrl(item.imageUrl) || '',
        videoUrl: item.videoUrl
          ? (item.videoUrl.startsWith('http') ? item.videoUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${item.videoUrl}`)
          : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${id}.mp4`,
        description: item.description || item.name || '',
        sound: 'Original Sound',
        comments: formatCount(item.commentCount || 0),
        shares: '0',
        views: formatCount(item.views || 0),
        creatorUsername: item.minterUsername || 'user',
        creatorId: minterAddress,
        displayName: item.minterDisplayName || undefined,
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
    setSelectedDuration(DURATION_FILTERS[0]);
    setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
  };

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <Video className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Videos Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? 'Unable to load videos. Please try again.'
          : 'Be the first to upload a video!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  // Filtered empty state (when filters return no results but API has data)
  const FilteredEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
        <Filter className="w-6 h-6 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold mb-1">No matches</h3>
      <p className="text-zinc-400 text-sm mb-3">
        Try adjusting your filters
      </p>
      <button 
        onClick={clearFilters}
        className="text-sm text-white/70 hover:text-white underline"
      >
        Clear filters
      </button>
    </div>
  );

  const { isAutoRetrying } = useAutoRetryFeed({
    itemCount: allVideos.length,
    isLoading: isApiLoading,
    isError,
    refetch,
  });

  // Show loading during initial load or while auto-fetching for duration filter
  if (isRefreshing || isApiLoading || isAutoFetching || isAutoRetrying) {
    return (
      <div className="p-2 sm:p-3 pt-0 sm:pt-0">
        <VideosFeedSkeleton />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3 pt-0 sm:pt-0">
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
            <div data-no-swipe className="relative px-2 sm:px-3 pb-2 space-y-4">
              <SortFilterSection selected={selectedSort} onSelect={handleSortSelect} />
              <CategoryFilterSection 
                categories={categories} 
                selectedCategory={selectedCategory} 
                onSelect={setSelectedCategory}
                isLoading={categoriesLoading}
              />
              <DurationFilterSection selected={selectedDuration} onSelect={setSelectedDuration} />
              <UploadDateFilterSection selected={selectedUploadDate} onSelect={setSelectedUploadDate} />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
                <div className="relative">
                  <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1" style={{ touchAction: 'pan-x' }}>
                    {CONTENT_TYPE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => toggleContentFilter(filter.value)}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          contentFilters[filter.value]
                            ? ACTIVE_FILTER_CLASS
                            : INACTIVE_FILTER_CLASS
                        )}
                      >
                        {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
                      </button>
                    ))}
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none" />
                </div>
              </div>
              {/* Reset filters - bottom right */}
              <button
                onClick={() => {
                  setSelectedSort(SORT_OPTIONS[0]);
                  setSelectedCategory(null);
                  setSelectedDuration(DURATION_FILTERS[0]);
                  setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
                  resetContentFilters();
                }}
                className="absolute bottom-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label={t('filters.resetFilters')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Featured/Ad Row - First 3 videos as thumbnails (only show for "Latest" sort) */}
      {videos.length >= 3 && selectedSort.value === 'latest' && (
        <div className="mb-3">
          {/* Desktop/Tablet: 3 thumbnails in a row */}
          <div className="hidden sm:grid grid-cols-3 gap-2">
            {videos.slice(0, 3).map((video) => (
              <button 
                key={`featured-${video.id}`}
                onClick={() => navigate(`/app/post/${video.id}`)}
                className="relative aspect-video rounded-xl overflow-hidden group cursor-pointer text-left"
              >
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                
                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                  </div>
                </div>
                
                {/* Creator info at top */}
                <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md overflow-hidden flex-shrink-0 bg-zinc-700 flex items-center justify-center relative">
                    {video.channelAvatar && (
                      <img 
                        src={video.channelAvatar}
                        alt=""
                        className="w-full h-full object-cover absolute inset-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).remove(); }}
                      />
                    )}
                    <span className="text-white text-[8px] font-medium">{video.channel?.[0]?.toUpperCase()}</span>
                  </div>
                  <span className="text-white text-[10px] font-medium truncate">{video.channel}</span>
                </div>
                
                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                  {video.duration}
                </div>
                
                {/* Title at bottom */}
                <div className="absolute bottom-2 left-2 right-12">
                  <p className="text-white text-xs font-medium line-clamp-1">{video.title}</p>
                </div>
              </button>
            ))}
          </div>
          
          {/* Mobile: Horizontally swipeable */}
          <div className="sm:hidden relative">
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />
            <SwipeableCarousel className="flex gap-2 overflow-x-auto scrollbar-hide">
              {videos.slice(0, 3).map((video) => (
                <button 
                  key={`featured-mobile-${video.id}`}
                  onClick={() => navigate(`/app/post/${video.id}`)}
                  className="relative flex-shrink-0 w-[70%] aspect-video rounded-xl overflow-hidden group cursor-pointer text-left"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                  
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                  
                  {/* Creator info at top */}
                  <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md overflow-hidden flex-shrink-0 bg-zinc-700 flex items-center justify-center relative">
                      {video.channelAvatar && (
                        <img 
                          src={video.channelAvatar}
                          alt=""
                          className="w-full h-full object-cover absolute inset-0"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).remove(); }}
                        />
                      )}
                      <span className="text-white text-[8px] font-medium">{video.channel?.[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-white text-[10px] font-medium truncate">{video.channel}</span>
                  </div>
                  
                  {/* Duration badge */}
                  <div className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                    {video.duration}
                  </div>
                  
                  {/* Title at bottom */}
                  <div className="absolute bottom-2 left-2 right-12">
                    <p className="text-white text-xs font-medium line-clamp-1">{video.title}</p>
                  </div>
                </button>
              ))}
            </SwipeableCarousel>
          </div>
        </div>
      )}

      {/* Video Grid or Empty State */}
      {allVideos.length === 0 ? (
        <EmptyState />
      ) : videos.length === 0 && hasActiveFilters ? (
        <FilteredEmptyState />
      ) : (
        <div key={`${selectedSort.value}-${selectedUploadDate.value}`}>
          <div className="space-y-5">
            {/* Skip first 3 videos ONLY if featured row is shown (only for "Latest" sort), then insert carousels at intervals */}
            {(videos.length >= 3 && selectedSort.value === 'latest' ? videos.slice(3) : videos).map((video, index) => {
              const elements: React.ReactNode[] = [];
              
              // Add video card wrapped in bento container
              elements.push(
                <div key={video.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
                  <VideoCard video={video} />
                </div>
              );
              
              // Insert live categories carousel after 5 posts (index 4, since 0-indexed)
              if (index === LIVE_CATEGORIES_INSERT_AFTER - 1) {
                elements.push(<LiveCategoriesCarousel key="live-categories-carousel" />);
              }
              
              // Insert shorts carousel after 9 posts (index 8)
              if (index === SHORTS_INSERT_AFTER - 1 && shorts.length > 0) {
                elements.push(<ShortsReel key="shorts-carousel" shorts={shorts} />);
              }
              
              return elements;
            })}
          </div>

          {/* Infinite scroll loader */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading more...</span>
              </div>
            )}
            {!hasNextPage && videos.length > 0 && (
              <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
