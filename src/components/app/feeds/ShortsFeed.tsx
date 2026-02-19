/**
 * Shorts Feed Component
 * =====================
 * Displays short-form video content from DeHub API.
 * 
 * @module components/app/feeds/ShortsFeed
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { usePersistedFeedFilter } from '@/hooks/use-persisted-feed-filter';
import { RefreshCw, Play, Filter, Eye, Loader2 } from 'lucide-react';
import { ShortsFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { useDeHubFeed } from '@/hooks/use-dehub-feed';
import { getMediaUrl, getCategories, type DeHubCategory, type DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, applySorting, filterByDate, getApiSortMode, type SortOption, type DateFilterOption } from '@/lib/feed-utils';
import type { ShortVideo } from '@/types/feed.types';

// ============================================================================
// CONSTANTS
// ============================================================================

// Sort options are imported from feed-utils

// Duration filters (client-side filtering) - shorter for shorts
const DURATION_FILTERS = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '< 15s', min: 0, max: 15 },
  { label: '15-30s', min: 15, max: 30 },
  { label: '30-60s', min: 30, max: 60 },
  { label: '60s+', min: 60, max: Infinity },
];

// Upload date filters - imported from feed-utils for consistency

// Fallback categories if API fails
const FALLBACK_CATEGORIES: DeHubCategory[] = [
  { id: 'dance', name: 'Dance', slug: 'dance' },
  { id: 'comedy', name: 'Comedy', slug: 'comedy' },
  { id: 'music', name: 'Music', slug: 'music' },
  { id: 'gaming', name: 'Gaming', slug: 'gaming' },
  { id: 'food', name: 'Food', slug: 'food' },
  { id: 'pets', name: 'Pets', slug: 'pets' },
];

type DurationFilter = typeof DURATION_FILTERS[number];

// Shared filter pill styles
const ACTIVE_FILTER_CLASS = 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';
const INACTIVE_FILTER_CLASS = 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';

// ============================================================================
// HELPERS
// ============================================================================

function formatLikes(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

// Parse duration string to seconds (e.g., "0:15" → 15)
function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Parse timeAgo string to approximate Date
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

// Map video NFT to ShortVideo format
function mapToShortVideo(nft: any, index: number): ShortVideo & { durationSeconds: number; uploadedAgo: string } {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  // Use videoDuration (number in seconds) directly if available, fallback to string parsing
  const durationSeconds = typeof nft.videoDuration === 'number' 
    ? nft.videoDuration 
    : parseDurationToSeconds(nft.duration || '0:00');
  const viewCount = nft.views || nft.view_count || 0;
  const minterAddress = nft.minter || nft.creator?.id || nft.creator?.address || '';
  
  // Try all possible avatar fields - same pattern as leaderboard/profile
  const rawAvatarUrl = nft.minterAvatarUrl || nft.minterAvatarImg || nft.avatarUrl || nft.avatarImg ||
                       nft.creator?.avatar_url || nft.creator?.avatarImg || nft.creator?.avatarUrl;
  const avatarUrl = rawAvatarUrl?.startsWith('http') 
    ? rawAvatarUrl 
    : buildAvatarUrl(minterAddress, rawAvatarUrl);
  
  return {
    id,
    type: 'short',
    username: nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    // Use minterUsername for the @handle, not display name
    handle: nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    avatar: avatarUrl || (minterAddress ? `https://api.dicebear.com/7.x/identicon/svg?seed=${minterAddress}` : undefined),
    likes: String(nft.totalVotes?.for || nft.like_count || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || (id ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${id}.mp4` : ''),
    description: nft.description || nft.name || nft.title || '',
    sound: 'Original Sound',
    comments: formatLikes(nft.commentCount || nft.comment_count || 0),
    shares: '0',
    views: formatLikes(viewCount),
    durationSeconds: Math.round(durationSeconds),
    uploadedAgo: nft.uploadedAgo || nft.createdAt || '1d ago',
    creatorUsername: nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    creatorId: minterAddress,
    displayName: nft.minterDisplayName || undefined,
  } as ShortVideo & { durationSeconds: number; uploadedAgo: string; handle: string };
}

// ============================================================================
// FILTER SECTION COMPONENTS
// ============================================================================

function SortFilterSection({ selected, onSelect }: { selected: SortOption; onSelect: (o: SortOption) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.sort')}</span>
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6" style={{ touchAction: 'pan-x' }}>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => onSelect(option)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selected.label === option.label
                  ? ACTIVE_FILTER_CLASS
                  : INACTIVE_FILTER_CLASS
              )}
            >
              {t(`filters.${option.value === 'most-viewed' ? 'mostViewed' : option.value === 'most-liked' ? 'mostLiked' : option.value === 'most-comments' ? 'mostComments' : option.value}`, option.label)}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

function DurationFilterSection({ selected, onSelect }: { selected: DurationFilter; onSelect: (o: DurationFilter) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.duration')}</span>
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6" style={{ touchAction: 'pan-x' }}>
          {DURATION_FILTERS.map((option) => (
            <button
              key={option.label}
              onClick={() => onSelect(option)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                selected.label === option.label
                  ? ACTIVE_FILTER_CLASS
                  : INACTIVE_FILTER_CLASS
              )}
            >
              {option.label === 'Any' ? t('filters.any') : option.label}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
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
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6" style={{ touchAction: 'pan-x' }}>
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
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

function UploadDateFilterSection({ selected, onSelect }: { selected: DateFilterOption; onSelect: (o: DateFilterOption) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.uploadDate')}</span>
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
          {DATE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => onSelect(option)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selected.label === option.label
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {option.value === 'all' ? t('filters.all') : option.label}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ShortsFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

export function ShortsFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: ShortsFeedProps) {
  const { t } = useI18n();
  // Sort is now client-side - default to "Latest" instead of "Random" to avoid 5-page prefetch - persisted
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('shorts', 'sort', SORT_OPTIONS[0]);
  // Duration and upload date are client-side filters - persisted
  const [selectedDuration, setSelectedDuration] = usePersistedFeedFilter<typeof DURATION_FILTERS[number]>('shorts', 'duration', DURATION_FILTERS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter<DateFilterOption>('shorts', 'date', DATE_FILTER_OPTIONS[0]);
  const [selectedCategory, setSelectedCategory] = usePersistedFeedFilter<string | null>('shorts', 'category', null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const loaderRef = useRef<HTMLDivElement>(null);

  const { walletAddress } = useAuth();

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

  // Fetch from DeHub API - pass sortMode based on selected filter
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
  } = useDeHubFeed({
    unit: 12,
    sortMode: getApiSortMode(selectedSort.value),
    category: selectedCategory || undefined,
    postType: 'video',
  });

  // Refetch when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Get raw NFTs for sorting
  const allRawNFTs = useMemo((): DeHubNFT[] => {
    if (!apiData?.pages) return [];
    return apiData.pages.flatMap(page => page.data || []);
  }, [apiData]);

  // Apply date filter on raw NFTs, then sort and map to ShortVideo array
  const allShorts = useMemo(() => {
    // API now returns only videos (postType: 'video'), no client-side filter needed
    const dateFiltered = filterByDate(allRawNFTs, selectedUploadDate.value);
    const sorted = applySorting(dateFiltered, selectedSort.value);
    return sorted.map((nft, index) => mapToShortVideo(nft, index));
  }, [allRawNFTs, selectedSort.value, selectedUploadDate.value]);

  // Apply client-side duration filter
  const shorts = useMemo((): ShortVideo[] => {
    // Duration filter
    if (selectedDuration.max !== Infinity || selectedDuration.min !== 0) {
      return allShorts.filter(short => {
        return short.durationSeconds >= selectedDuration.min && short.durationSeconds < selectedDuration.max;
      });
    }
    
    return allShorts;
  }, [allShorts, selectedDuration]);

  // Check if any client-side filters are active
  const hasActiveFilters = selectedDuration.label !== 'Any' || selectedUploadDate.value !== 'all';

  // Reset client-side filters
  const clearFilters = () => {
    setSelectedDuration(DURATION_FILTERS[0]);
    setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
  };

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleShortClick = (index: number) => {
    setSelectedIndex(index);
    setViewerOpen(true);
  };

  const isLoading = isApiLoading || isRefreshing;

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <Play className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Shorts Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? 'Unable to load shorts. Please try again.'
          : 'Be the first to create a short!'}
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
    itemCount: allShorts.length,
    isLoading: isApiLoading,
    isError,
    refetch,
  });

  if (isLoading || isAutoRetrying) {
    return (
      <div className="p-2 sm:p-3 pt-0 sm:pt-0">
        <ShortsFeedSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="p-2 sm:p-3 pt-0 sm:pt-0">
        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div data-no-swipe className="relative bg-zinc-900 rounded-2xl p-4 mb-3 space-y-4">
                <SortFilterSection selected={selectedSort} onSelect={setSelectedSort} />
                <CategoryFilterSection 
                  categories={categories} 
                  selectedCategory={selectedCategory} 
                  onSelect={setSelectedCategory}
                  isLoading={categoriesLoading}
                />
                <DurationFilterSection selected={selectedDuration} onSelect={setSelectedDuration} />
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.uploadDate')}</span>
                  <div className="relative">
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6" style={{ touchAction: 'pan-x' }}>
                      {DATE_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.label}
                          onClick={() => setSelectedUploadDate(option)}
                          className={cn(
                            'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            selectedUploadDate.label === option.label
                              ? ACTIVE_FILTER_CLASS
                              : INACTIVE_FILTER_CLASS
                          )}
                        >
                          {option.value === 'all' ? t('filters.all') : option.label}
                        </button>
                      ))}
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
                  </div>
                </div>
                {/* Reset filters - bottom right */}
                <button
                  onClick={() => {
                    setSelectedSort(SORT_OPTIONS[1]);
                    setSelectedCategory(null);
                    setSelectedDuration(DURATION_FILTERS[0]);
                    setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
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

        {/* Shorts Grid or Empty State */}
        {allShorts.length === 0 ? (
          <EmptyState />
        ) : shorts.length === 0 && hasActiveFilters ? (
          <FilteredEmptyState />
        ) : (
          <div key={`${selectedSort.value}-${selectedUploadDate.value}`}>
            {/* Shorts Grid - TikTok Style */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
              {shorts.map((short, index) => (
                <div
                  key={short.id}
                  onClick={() => handleShortClick(index)}
                  className="relative aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden cursor-pointer group"
                >
                  {/* Thumbnail */}
                  <img
                    src={short.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                  {/* Bottom Info */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                    <div className="flex items-center gap-2">
                      {/* Creator Avatar */}
                      <div className="w-7 h-7 rounded-md bg-zinc-700 flex-shrink-0 overflow-hidden">
                        {short.avatar ? (
                          <img 
                            src={short.avatar} 
                            alt="" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <span className={`w-full h-full flex items-center justify-center text-white text-[10px] font-medium ${short.avatar ? 'hidden' : ''}`}>
                          {short.username?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-white text-sm">@{(short as any).handle || short.creatorUsername || short.username}</span>
                          {short.verified && (
                            <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </div>
                        <p className="text-white text-xs">{short.likes} {short.likes === '1' ? 'like' : 'likes'}</p>
                      </div>
                    </div>
                    {/* View count - bottom right */}
                    <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                      <Eye className="w-3 h-3 text-white" />
                      <span className="text-white text-xs font-medium">{short.views || '0'}</span>
                    </div>
                  </div>

                  {/* Play indicator on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Infinite scroll loader */}
            <div ref={loaderRef} className="flex justify-center py-6">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading more...</span>
                </div>
              )}
              {!hasNextPage && shorts.length > 0 && (
                <p className="text-zinc-500 text-sm">No more shorts to load</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full-screen Shorts Viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <ShortsViewer
            shorts={shorts}
            initialIndex={selectedIndex}
            onClose={() => setViewerOpen(false)}
            onLoadMore={() => fetchNextPage()}
            hasMore={hasNextPage ?? false}
            isLoadingMore={isFetchingNextPage}
          />
        )}
      </AnimatePresence>
    </>
  );
}
