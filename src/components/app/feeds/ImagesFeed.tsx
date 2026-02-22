/**
 * Images Feed Component
 * =====================
 * Displays image posts in collage or endless scroll view.
 * Fetches from DeHub API.
 * 
 * @module components/app/feeds/ImagesFeed
 */

import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { ThumbsUp, ThumbsDown, MessageSquare, RefreshCw, ImageIcon, Grid3x3, Loader2, Ticket } from 'lucide-react';
import { ImagesFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedFilterPill } from '@/components/app/feeds/AnimatedFilterPill';
import { ImageCard } from '@/components/app/cards';
import { useAuth } from '@/contexts/AuthContext';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, type SortOption, type DateFilterOption, type ContentTypeFilters } from '@/lib/feed-utils';
import { usePersistedFeedFilter, usePersistedContentFilters } from '@/hooks/use-persisted-feed-filter';

import { useDeHubImages, mapNFTToImagePost } from '@/hooks/use-dehub-feed';
import { useUnifiedFeed, mapToImagePost } from '@/hooks/use-unified-feed';
import type { ImagePost } from '@/types/feed.types';

/** Number of pages to pre-fetch for random mode cross-page shuffling */
const RANDOM_PREFETCH_PAGES = 5;

// ============================================================================
// TYPES
// ============================================================================

interface ImagesFeedProps {
  showCollage?: boolean;
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
  /** When set, switches to feed mode starting from this post */
  selectedPostId?: string | null;
  /** Callback to clear selected post and switch modes */
  onPostSelected?: (postId: string | null) => void;
  /** Callback to return to collage view from feed */
  onBackToCollage?: () => void;
}

// ============================================================================
// FILTER COMPONENTS
// ============================================================================

function SortFilterSection({ selected, onSelect }: { selected: SortOption; onSelect: (o: SortOption) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.sort')}</span>
      <div className="relative">
        <div className="flex gap-1.5 scrollbar-hide whitespace-nowrap pr-6">
          {SORT_OPTIONS.map((option) => (
            <AnimatedFilterPill
              key={option.label}
              layoutId="images-sort"
              isActive={selected.label === option.label}
              onClick={() => onSelect(option)}
            >
              {t(`filters.${option.value === 'most-viewed' ? 'mostViewed' : option.value === 'most-liked' ? 'mostLiked' : option.value === 'most-comments' ? 'mostComments' : option.value}`, option.label)}
            </AnimatedFilterPill>
          ))}
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
        <div className="flex gap-1.5 scrollbar-hide whitespace-nowrap pr-6">
          {DATE_FILTER_OPTIONS.map((option) => (
            <AnimatedFilterPill
              key={option.label}
              layoutId="images-date"
              isActive={selected.label === option.label}
              onClick={() => onSelect(option)}
            >
              {option.value === 'all' ? t('filters.all') : option.label}
            </AnimatedFilterPill>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

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
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
          {CONTENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onToggle(filter.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filters[filter.value]
                  ? 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CollageViewProps {
  posts: ImagePost[];
  onImageClick: (postId: string) => void;
  loaderRef: React.RefObject<HTMLDivElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

function CollageView({ posts, onImageClick, loaderRef, isFetchingNextPage, hasNextPage }: CollageViewProps) {
  return (
    <div className="p-1 sm:p-2 pt-0 sm:pt-0">
      <div 
        className="grid grid-cols-3 gap-0.5 sm:gap-1 overflow-hidden rounded-t-2xl"
        style={{ gridAutoFlow: 'dense' }}
      >
        {posts.map((post, index) => {
          // Make every 4th item (starting from 0) a large tile: 0, 4, 8, 12...
          const isLargeTile = index % 4 === 0;
          
          return (
            <div
              key={post.id}
              onClick={() => onImageClick(post.id)}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt=""
                className={cn(
                  "w-full h-full object-cover transition-transform duration-300 group-hover:scale-105",
                  post.isPPV && "blur-lg"
                )}
              />
              {/* PPV overlay in collage */}
              {post.isPPV && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Ticket className="h-5 w-5 text-white" />
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 sm:gap-5">
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Infinite scroll loader for collage */}
      <div ref={loaderRef} className="py-4 flex justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
        )}
      </div>
    </div>
  );
}

interface EndlessScrollViewProps {
  posts: ImagePost[];
  loaderRef: React.RefObject<HTMLDivElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  startFromId?: string | null;
  onBackToCollage?: () => void;
}

function EndlessScrollView({ 
  posts, 
  loaderRef, 
  isFetchingNextPage, 
  hasNextPage,
  startFromId,
  onBackToCollage,
}: EndlessScrollViewProps) {
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  
  // Reorder posts to start from selected image
  const orderedPosts = useMemo(() => {
    if (!startFromId) return posts;
    
    const selectedIndex = posts.findIndex(p => p.id === startFromId);
    if (selectedIndex <= 0) return posts;
    
    // Move selected post to the top, keep rest in order after it
    return [
      ...posts.slice(selectedIndex),
      ...posts.slice(0, selectedIndex),
    ];
  }, [posts, startFromId]);
  
  // Scroll to top when entering feed view from collage
  useEffect(() => {
    if (startFromId) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [startFromId]);

  return (
    <div className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-3 relative">
      {/* Back to Grid Button - Bottom center, above mobile nav */}
      {onBackToCollage && (
        <button
          onClick={onBackToCollage}
          className="fixed bottom-[72px] lg:bottom-8 left-1/2 -translate-x-1/2 lg:-translate-x-[calc(50%+30px)] z-20 p-3 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded-xl border border-white/10 shadow-lg hover:bg-black/60 transition-colors"
          aria-label="Back to grid view"
        >
          <Grid3x3 className="w-5 h-5 text-white" />
        </button>
      )}
      
      <div ref={scrollTargetRef} />
      {orderedPosts.map((post) => (
        <div key={post.id} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
          <ImageCard post={post} />
        </div>
      ))}
      
      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-4 flex justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImagesFeed({ 
  showCollage = true, 
  showFilters = false,
  isRefreshing = false, 
  refreshKey = 0,
  selectedPostId = null,
  onPostSelected,
  onBackToCollage,
}: ImagesFeedProps) {
  const { t } = useI18n();
  const hasAnimated = useRef(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false); // Synchronous fetch guard to prevent race conditions
  
  // Filter states - default to "Latest" - persisted to sessionStorage
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('images', 'sort', SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter<DateFilterOption>('images', 'date', DATE_FILTER_OPTIONS[0]);
  const [contentFilters, toggleContentFilter, resetContentFilters] = usePersistedContentFilters('images');
  
  
  // Get wallet address for authenticated requests
  const { walletAddress } = useAuth();

  // Determine if premium content filters are active
  const isPremiumFilterActive = contentFilters.ppv || contentFilters.w2e || contentFilters.locked;
  
  // Fetch from DeHub API (default - no content filters)
  const {
    data: apiData,
    fetchNextPage: fetchNextPageDefault,
    hasNextPage: hasNextPageDefault,
    isFetchingNextPage: isFetchingNextPageDefault,
    isLoading: isApiLoadingDefault,
    isError: isErrorDefault,
    refetch: refetchDefault,
  } = useDeHubImages({
    unit: 12,
    sortMode: selectedSort.value === 'most-liked' ? 'popular' : 'new',
  });

  // Fetch from unified feed API (when content filters are active)
  const {
    data: unifiedData,
    fetchNextPage: fetchNextPageUnified,
    hasNextPage: hasNextPageUnified,
    isFetchingNextPage: isFetchingNextPageUnified,
    isLoading: isApiLoadingUnified,
    isError: isErrorUnified,
    refetch: refetchUnified,
  } = useUnifiedFeed({
    postType: 'feed-images',
    isPPV: contentFilters.ppv || undefined,
    hasBounty: contentFilters.w2e || undefined,
    isLocked: contentFilters.locked || undefined,
    limit: 12,
    status: 'minted',
    sortBy: selectedSort.value === 'most-liked' ? 'likes' : 'createdAt',
    sortOrder: 'desc',
    enabled: isPremiumFilterActive,
  });

  // Select the active data source based on filter state
  const fetchNextPage = isPremiumFilterActive ? fetchNextPageUnified : fetchNextPageDefault;
  const hasNextPage = isPremiumFilterActive ? hasNextPageUnified : hasNextPageDefault;
  const isFetchingNextPage = isPremiumFilterActive ? isFetchingNextPageUnified : isFetchingNextPageDefault;
  const isApiLoading = isPremiumFilterActive ? isApiLoadingUnified : isApiLoadingDefault;
  const isError = isPremiumFilterActive ? isErrorUnified : isErrorDefault;
  const refetch = isPremiumFilterActive ? refetchUnified : refetchDefault;

  // Refetch when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Map API data to ImagePost array
  const imagePosts = useMemo(() => {
    if (isPremiumFilterActive) {
      if (!unifiedData?.pages) return [];
      const allItems = unifiedData.pages.flatMap(page => page.items || []);
      return allItems.map((item, index) => mapToImagePost(item, index));
    }
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToImagePost(nft, index));
  }, [apiData, unifiedData, isPremiumFilterActive]);

  // Handle image click in collage - switch to feed view
  const handleImageClick = (postId: string) => {
    onPostSelected?.(postId);
  };

  // Infinite scroll observer - uses ref-based guard to prevent race conditions
  // Now works in BOTH collage and feed view
  // Store hasNextPage in a ref to avoid stale closures in the observer callback
  const hasNextPageRef = useRef(hasNextPage);
  hasNextPageRef.current = hasNextPage;
  
  useEffect(() => {
    if (!loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Use refs for synchronous check - prevents multiple fetches from stale closures
        if (entries[0].isIntersecting && hasNextPageRef.current && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, showCollage, selectedPostId]); // Re-attach when view mode changes
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  // Show loading during initial load
  const isLoading = isApiLoading || isRefreshing;
  
  // Determine if we should show collage or feed
  // Show feed if: collage is off, OR user clicked an image from collage
  const showFeedView = !showCollage || selectedPostId;

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <ImageIcon className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Images Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? 'Unable to load images. Please try again.'
          : 'Be the first to share an image!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  const { isAutoRetrying } = useAutoRetryFeed({
    itemCount: imagePosts.length,
    isLoading: isApiLoading,
    isError,
    refetch,
  });

  if (isLoading || isAutoRetrying) {
    return (
      <div className="p-2 sm:p-3 pt-0 sm:pt-0">
        <ImagesFeedSkeleton />
      </div>
    );
  }

  if (imagePosts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      {/* Filter Section */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="relative px-2 sm:px-3 pb-2 space-y-4">
              <SortFilterSection 
                selected={selectedSort} 
                onSelect={setSelectedSort} 
              />
              <UploadDateFilterSection 
                selected={selectedUploadDate} 
                onSelect={setSelectedUploadDate} 
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
                <div className="relative">
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
                    {CONTENT_TYPE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => toggleContentFilter(filter.value)}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          contentFilters[filter.value]
                            ? 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        )}
                      >
                        {t(`filters.${filter.value === 'w2e' ? 'bounty' : filter.value}`, filter.label)}
                      </button>
                    ))}
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
                </div>
              </div>
              {/* Reset filters - bottom right */}
              <button
                onClick={() => {
                  setSelectedSort(SORT_OPTIONS[0]);
                  setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
                  resetContentFilters();
                }}
                className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label={t('filters.resetFilters')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {showFeedView ? (
        <EndlessScrollView 
          posts={imagePosts} 
          loaderRef={loaderRef}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage ?? false}
          startFromId={selectedPostId}
          onBackToCollage={onBackToCollage}
        />
      ) : (
        <CollageView 
          posts={imagePosts} 
          onImageClick={handleImageClick}
          loaderRef={loaderRef}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage ?? false}
        />
      )}
    </div>
  );
}
