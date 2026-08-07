/**
 * Images Feed Component
 * =====================
 * Displays image posts in collage or endless scroll view.
 * Fetches from DeHub API.
 * 
 * @module components/app/feeds/ImagesFeed
 */

import { Fragment, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { toast } from 'sonner';
import { useTranslation as useI18n } from 'react-i18next';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { ThumbsUp, ThumbsDown, MessageSquare, RefreshCw, ImageIcon, Loader2, Ticket } from 'lucide-react';
import { ImagesFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { FeedFilterLoader } from '@/components/app/feeds/FeedFilterLoader';
import { useFeedFilterTransition } from '@/hooks/use-feed-filter-transition';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { ImageCard } from '@/components/app/cards';
import { SponsoredAdCard } from '@/components/app/cards/SponsoredAdCard';
import { useServedAds } from '@/hooks/use-ad-serving';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, type SortOption, type DateFilterOption, type ContentTypeFilters } from '@/lib/feed-utils';
import { usePersistedFeedFilter, usePersistedContentFilters } from '@/hooks/use-persisted-feed-filter';

import { useDeHubImages, mapNFTToImagePost } from '@/hooks/use-dehub-feed';
import { useUnifiedFeed, mapToImagePost } from '@/hooks/use-unified-feed';
import type { ImagePost } from '@/types/feed.types';

/** Number of pages to pre-fetch for random mode cross-page shuffling */
const RANDOM_PREFETCH_PAGES = 5;

// Opening the feed used to hang because every ImageCard in the loaded set
// mounted in one commit — each is a carousel, a comments wrapper and its own
// tip-count query, so sixty cards meant sixty requests fired at once behind a
// blocking render. The list is grown a few cards per frame instead: the tapped
// post is on screen in the first commit and the rest arrive underneath it while
// the user is already looking at what they asked for.
const MOUNT_INITIAL = 3;
const MOUNT_STEP = 4;

/**
 * Infinite-scroll sentinel observer, one per caller.
 *
 * The collage and the scroll view are both mounted once the feed has been
 * opened, so they cannot share an observer — the second sentinel to render
 * would take it and leave the first view unable to page.
 */
function useInfiniteLoaderRef(
  hasNextPage: boolean | undefined,
  fetchNextPage: () => Promise<unknown>,
  isFetchingRef: React.MutableRefObject<boolean>,
): React.RefCallback<HTMLDivElement> {
  // Read through refs so the callback identity never changes: a new identity
  // would detach and re-attach the observer on every render of the feed.
  const hasNextPageRef = useRef(hasNextPage);
  hasNextPageRef.current = hasNextPage;
  const fetchNextPageRef = useRef(fetchNextPage);
  fetchNextPageRef.current = fetchNextPage;

  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPageRef.current && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPageRef.current().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { threshold: 0.1, rootMargin: '400px' },
    );

    observerRef.current.observe(node);
  }, [isFetchingRef]);
}

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
        <GlassFilterRow
          items={SORT_OPTIONS.map((o) => ({ key: o.label, label: t(`filters.${o.value === 'most-viewed' ? 'mostViewed' : o.value === 'most-liked' ? 'mostLiked' : o.value === 'most-comments' ? 'mostComments' : o.value}`, o.label) }))}
          activeKey={selected.label}
          onSelect={(key) => { const o = SORT_OPTIONS.find(x => x.label === key); if (o) onSelect(o); }}
        />
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none z-20" />
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
        <GlassFilterRow
          items={DATE_FILTER_OPTIONS.map((o) => ({ key: o.label, label: o.value === 'all' ? t('filters.all') : o.label }))}
          activeKey={selected.label}
          onSelect={(key) => { const o = DATE_FILTER_OPTIONS.find(x => x.label === key); if (o) onSelect(o); }}
        />
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black to-transparent pointer-events-none z-20" />
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
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
      <div className="relative">
        <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1">
          {CONTENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              data-feed-filter-button
              data-active={filters[filter.value] ? 'true' : undefined}
              onClick={() => onToggle(filter.value)}
              data-filter-chip
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filters[filter.value]
                  ? cn(
                      'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white',
                      isLightTheme
                        ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05)]'
                        : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]'
                    )
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface CollageViewProps {
  posts: ImagePost[];
  onImageClick: (postId: string) => void;
  loaderRef: React.RefCallback<HTMLDivElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

function CollageView({ posts, onImageClick, loaderRef, isFetchingNextPage, hasNextPage }: CollageViewProps) {
  const { t } = useI18n();
  const { isCollapsed } = useSidebarCollapse();
  return (
    <div className="p-1 sm:p-2 pt-0 sm:pt-0">
      <div 
        className={cn(
          "grid gap-0.5 sm:gap-1 overflow-hidden rounded-t-2xl",
          isCollapsed ? "grid-cols-4" : "grid-cols-3"
        )}
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
                  "w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover:scale-105",
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
            <span className="text-sm">{t('common.loadingMore')}</span>
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
  loaderRef: React.RefCallback<HTMLDivElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  startFromId?: string | null;
}

function EndlessScrollView({
  posts,
  loaderRef,
  isFetchingNextPage,
  hasNextPage,
  startFromId,
}: EndlessScrollViewProps) {
  const { t } = useI18n();
  const scrollTargetRef = useRef<HTMLDivElement>(null);

  // One sponsored slot, directly under the post the user opened — the same
  // placement the post pages give it through the Related*Feed rails. Served off
  // the 'home' surface because the images tab is a home feed tab (it has no URL
  // of its own, it renders at /app), so it draws on inventory that already
  // exists rather than needing a new surface taught to the ads-serve function.
  const { data: servedAdList = [] } = useServedAds('home', { count: 1 });
  const servedAd = servedAdList[0] ?? null;

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
  
  // Grow the mounted window a few cards per frame (see MOUNT_INITIAL), and
  // never shrink it: tapping a second tile only rotates `orderedPosts`, and
  // the keys are post ids, so React moves the existing cards instead of
  // rebuilding them. Resetting the window here would throw away sixty live
  // cards and re-run all their queries to show the same posts again.
  const [mountedCount, setMountedCount] = useState(MOUNT_INITIAL);
  useEffect(() => {
    if (mountedCount >= orderedPosts.length) return;
    const raf = requestAnimationFrame(() => {
      setMountedCount((c) => Math.min(orderedPosts.length, c + MOUNT_STEP));
    });
    return () => cancelAnimationFrame(raf);
  }, [mountedCount, orderedPosts.length]);

  const visiblePosts = useMemo(
    () => orderedPosts.slice(0, mountedCount),
    [orderedPosts, mountedCount],
  );
  // The sentinel must not exist while the window is still filling, or it sits
  // three cards below the fold and pages the API on every entry.
  const fullyMounted = mountedCount >= orderedPosts.length;

  // Scroll to top when entering feed view from collage
  useEffect(() => {
    if (startFromId) {
      // Reset scroll immediately and after a frame to catch any layout shifts
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      // Also scroll any overflow parent containers
      const scrollParent = scrollTargetRef.current?.closest('[class*="overflow"]');
      if (scrollParent) scrollParent.scrollTop = 0;
      // After paint, ensure we're still at top
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    }
  }, [startFromId]);

  return (
    <div data-feed-root className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-3 relative">
      {/* Returning to the grid is the nav pill's left slot (it swaps its
          settings icon for a back arrow while this view is up), so there is no
          floating button over the feed. */}
      <div ref={scrollTargetRef} />
      {visiblePosts.map((post, index) => (
        <Fragment key={post.id}>
          <div
            data-feed-item
            className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3"
            style={index >= 3 ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 0 auto 640px' } : undefined}
          >
            <ImageCard post={post} />
          </div>
          {index === 0 && servedAd && (
            <div data-feed-item className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
              <SponsoredAdCard ad={servedAd} />
            </div>
          )}
        </Fragment>
      ))}

      {/* Infinite scroll loader */}
      {fullyMounted && (
        <div ref={loaderRef} className="py-4 flex justify-center">
          {isFetchingNextPage && (
            <div className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{t('common.loadingMore')}</span>
            </div>
          )}
          {!hasNextPage && posts.length > 0 && (
            <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
          )}
        </div>
      )}
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
}: ImagesFeedProps) {
  const { t } = useI18n();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const hasAnimated = useRef(false);
  const isFetchingRef = useRef(false); // Synchronous fetch guard to prevent race conditions
  
  // Filter states - default to "Latest" - persisted to sessionStorage
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('images', 'sort', SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter<DateFilterOption>('images', 'date', DATE_FILTER_OPTIONS[0]);
  const [contentFilters, toggleContentFilter, resetContentFilters] = usePersistedContentFilters('images');

  // Filter chips arm a loader on click so a sort switch never leaves the old
  // results sitting there looking frozen (the feed query keeps previous data).
  // The hook that owns it needs `isFetching` from the queries below, so a ref
  // bridges the gap — a click can't land before the effect that fills it.
  const beginFilterTransitionRef = useRef<() => void>(() => {});
  const beginFilterTransition = useCallback(() => {
    beginFilterTransitionRef.current();
  }, []);

  
  // Get wallet address for authenticated requests
  const { walletAddress, isAuthenticated } = useAuth();

  // Determine if we need the unified feed API (premium filters or following mode)
  const isPremiumFilterActive = contentFilters.ppv || contentFilters.w2e || contentFilters.locked;
  const isFollowingMode = selectedSort.value === 'following';
  const useUnifiedSource = isPremiumFilterActive || isFollowingMode;

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
    // Re-tapping the active chip changes nothing, so it must not flash a loader.
    if (option.value === selectedSort.value) return;
    beginFilterTransition();
    setSelectedSort(option);
  }, [isAuthenticated, selectedSort.value, setSelectedSort, beginFilterTransition]);

  // Every other chip row goes through these, so each one arms the loader.
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
    setSelectedSort(SORT_OPTIONS[0]);
    setSelectedUploadDate(DATE_FILTER_OPTIONS[0]);
    resetContentFilters();
  }, [setSelectedSort, setSelectedUploadDate, resetContentFilters, beginFilterTransition]);

  // Fetch from DeHub API (default - no content filters)
  const {
    data: apiData,
    fetchNextPage: fetchNextPageDefault,
    hasNextPage: hasNextPageDefault,
    isFetchingNextPage: isFetchingNextPageDefault,
    isLoading: isApiLoadingDefault,
    isFetching: isApiFetchingDefault,
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
    isFetching: isApiFetchingUnified,
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
    followingOnly: isFollowingMode ? true : undefined,
    enabled: useUnifiedSource,
  });

  // Select the active data source based on filter state
  const fetchNextPage = useUnifiedSource ? fetchNextPageUnified : fetchNextPageDefault;
  const hasNextPage = useUnifiedSource ? hasNextPageUnified : hasNextPageDefault;
  const isFetchingNextPage = useUnifiedSource ? isFetchingNextPageUnified : isFetchingNextPageDefault;
  const isApiLoading = useUnifiedSource ? isApiLoadingUnified : isApiLoadingDefault;
  const isApiFetching = useUnifiedSource ? isApiFetchingUnified : isApiFetchingDefault;
  const isError = useUnifiedSource ? isErrorUnified : isErrorDefault;
  const refetch = useUnifiedSource ? refetchUnified : refetchDefault;

  const filterTransition = useFeedFilterTransition(isApiFetching);
  useEffect(() => {
    beginFilterTransitionRef.current = filterTransition.begin;
  }, [filterTransition.begin]);

  // Refetch when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Map API data to ImagePost array
  const imagePosts = useMemo(() => {
    if (useUnifiedSource) {
      if (!unifiedData?.pages) return [];
      const allItems = unifiedData.pages.flatMap(page => page.items || []);
      return allItems.map((item, index) => mapToImagePost(item, index));
    }
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToImagePost(nft, index));
  }, [apiData, unifiedData, useUnifiedSource]);

  // Handle image click in collage - switch to feed view
  const handleImageClick = (postId: string) => {
    onPostSelected?.(postId);
  };

  const collageLoaderRef = useInfiniteLoaderRef(hasNextPage, fetchNextPage, isFetchingRef);
  const feedLoaderRef = useInfiniteLoaderRef(hasNextPage, fetchNextPage, isFetchingRef);

  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  // Show loading during initial load
  const isLoading = isApiLoading || isRefreshing;
  
  // Determine if we should show collage or feed
  // Show feed if: collage is off, OR user clicked an image from collage
  const showFeedView = !!(!showCollage || selectedPostId);

  // Once the scroll view has been opened both views stay mounted and swap by
  // `display`. Going back then costs nothing — the grid keeps its DOM, its
  // decoded images and its scroll height instead of rebuilding every tile — and
  // re-opening the feed skips the card mount entirely. The scroll view is still
  // mounted lazily, so a user who never taps a tile never pays for it.
  const [feedEverOpened, setFeedEverOpened] = useState(showFeedView);
  useEffect(() => {
    if (showFeedView) setFeedEverOpened(true);
  }, [showFeedView]);

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
    // An in-flight filter switch is not an empty feed — without this the retry
    // loop fires against the results the user is already waiting for.
    isLoading: isApiLoading || filterTransition.active,
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

  // An in-flight filter switch outranks "empty": bailing here would drop the
  // filter panel and the loader both, and read as the feed vanishing.
  if (imagePosts.length === 0 && !filterTransition.active) {
    return <EmptyState />;
  }

  return (
    <div>
      {/* Filter Section */}
      <AnimatePresence mode="wait">
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-y-clip overflow-x-visible"
          >
            <div data-feed-filter-panel className="relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-2 sm:px-3 py-3 space-y-4">
              <SortFilterSection 
                selected={selectedSort} 
                onSelect={handleSortSelect} 
              />
              <UploadDateFilterSection 
                selected={selectedUploadDate} 
                onSelect={selectUploadDate}
              />
              <div className="flex flex-col gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentType')}</span>
                <div className="relative">
                  <div className="flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1">
                    {CONTENT_TYPE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => selectContentFilter(filter.value)}
                        className={cn(
                          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          contentFilters[filter.value]
                            ? cn(
                                'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white',
                                isLightTheme
                                  ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05)]'
                                  : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]'
                              )
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
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
                onClick={resetAllFilters}
                className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label={t('filters.resetFilters')}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content. The filter loader sits BELOW the filter panel, not in place of
          the whole feed, so the chips the user is working with stay on screen
          and clickable while the request runs. */}
      {filterTransition.active ? (
        <FeedFilterLoader className="mt-3" />
      ) : (
        <>
          {feedEverOpened && (
            <div style={{ display: showFeedView ? 'block' : 'none' }}>
              <EndlessScrollView
                posts={imagePosts}
                loaderRef={feedLoaderRef}
                isFetchingNextPage={isFetchingNextPage}
                hasNextPage={hasNextPage ?? false}
                startFromId={selectedPostId}
              />
            </div>
          )}
          <div style={{ display: showFeedView ? 'none' : 'block' }}>
            <CollageView
              posts={imagePosts}
              onImageClick={handleImageClick}
              loaderRef={collageLoaderRef}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage ?? false}
            />
          </div>
        </>
      )}
    </div>
  );
}
