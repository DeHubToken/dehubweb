/**
 * Home Feed Component
 * ===================
 * Mixed content feed using the unified /api/feed endpoint.
 * Renders videos, images, and text posts based on postType.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, POST_TYPE_FILTERS, type SortOption, type DateFilterOption, type ContentTypeFilters, type PostTypeFilterValue } from '@/lib/feed-utils';

// Card components
import { 
  PostCard, 
  VideoCard, 
  ImageCard, 
  ShortsReel, 
  StoriesBar 
} from '@/components/app/cards';

// Unified feed hook
import { 
  useUnifiedFeed, 
  mapToVideoItem, 
  mapToImagePost, 
  mapToTextPost,
} from '@/hooks/use-unified-feed';
import { useDeHubStoryUsers, useDeHubVideos } from '@/hooks/use-dehub-feed';
import { getMediaUrl } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

import type { VideoItem, ImagePost, TextPost, ShortVideo } from '@/types/feed.types';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type FeedItemType = 
  | { type: 'post'; data: TextPost }
  | { type: 'video'; data: VideoItem }
  | { type: 'image'; data: ImagePost }
  | { type: 'shorts'; data: ShortVideo[] };

const PAGE_SIZE = 20;
const SHORTS_INSERT_INTERVAL = 6;

interface HomeFeedProps {
  shuffleKey: number;
  isRefreshing: boolean;
  showFilters?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

function mapNFTToShortVideo(nft: any): ShortVideo {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  const viewCount = nft.views || nft.view_count || nft.nft?.views || nft.nft?.view_count || 0;
  
  return {
    id,
    type: 'short',
    username: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    likes: formatCount(nft.totalVotes?.for || nft.like_count || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || '',
    description: nft.description || nft.name || nft.title || '',
    sound: 'Original Sound',
    comments: formatCount(nft.commentCount || nft.comment_count || 0),
    shares: formatCount(Math.floor(Math.random() * 1000)),
    views: formatCount(viewCount),
  };
}

/**
 * Map API sortBy to our sort option value
 */
function getSortByFromOption(sortValue: string): 'views' | 'likes' | 'createdAt' {
  switch (sortValue) {
    case 'most-viewed':
      return 'views';
    case 'most-liked':
      return 'likes';
    case 'most-comments':
      // Not included in return union; handled by caller with sortBy override
      return 'views';
    case 'latest':
    default:
      return 'createdAt';
  }
}

/**
 * Map date filter to API range parameter
 */
function getDateRange(dateValue: string): 'day' | 'week' | 'month' | 'year' | undefined {
  switch (dateValue) {
    case 'today':
      return 'day';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
    default:
      return undefined; // all time
  }
}

// ============================================================================
// FILTER SECTION COMPONENT
// ============================================================================

interface FilterSectionProps {
  selectedSort: SortOption;
  onSortSelect: (o: SortOption) => void;
  selectedDate: DateFilterOption;
  onDateSelect: (o: DateFilterOption) => void;
  selectedPostType: PostTypeFilterValue;
  onPostTypeSelect: (v: PostTypeFilterValue) => void;
  contentFilters: ContentTypeFilters;
  onContentFilterToggle: (filter: keyof ContentTypeFilters) => void;
}

function SortFilterSection({ 
  selectedSort, 
  onSortSelect, 
  selectedDate, 
  onDateSelect,
  selectedPostType,
  onPostTypeSelect,
  contentFilters,
  onContentFilterToggle,
}: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Sort Options */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Sort</span>
        <div className="flex gap-1.5 flex-wrap">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => onSortSelect(option)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selectedSort.label === option.label
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Date Filter Options */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Upload Date</span>
        <div className="flex gap-1.5 flex-wrap">
          {DATE_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onDateSelect(option)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selectedDate.value === option.value
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Post Type Filter */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Post Type</span>
        <div className="flex gap-1.5 flex-wrap">
          {POST_TYPE_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => onPostTypeSelect(option.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selectedPostType === option.value
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Type Filters */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Content Access</span>
        <div className="flex gap-1.5 flex-wrap">
          {CONTENT_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onContentFilterToggle(filter.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                contentFilters[filter.value]
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HomeFeed({ shuffleKey, isRefreshing, showFilters = false }: HomeFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
  // API default is now "most liked"
  const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[2]); // Most Liked
  const [selectedDate, setSelectedDate] = useState<DateFilterOption>(DATE_FILTER_OPTIONS[0]);
  const [selectedPostType, setSelectedPostType] = useState<PostTypeFilterValue>('all');
  const [contentFilters, setContentFilters] = useState<ContentTypeFilters>({
    ppv: false,
    w2e: false,
    locked: false,
  });

  const toggleContentFilter = (filter: keyof ContentTypeFilters) => {
    setContentFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
  };

  const { walletAddress } = useAuth();

  // Fetch story users from API
  const { storyUsers } = useDeHubStoryUsers(10);

  // Build API params from filters
  // API default is now 'likes' (most liked)
  const sortBy = useMemo(() => {
    switch (selectedSort.value) {
      case 'most-liked':
        return undefined; // API default
      case 'most-viewed':
        return 'views' as const;
      case 'most-comments':
        return 'comments' as const;
      case 'latest':
      default:
        return 'createdAt' as const;
    }
  }, [selectedSort.value]);

  const sortOrder = sortBy ? 'desc' : undefined;
  const range = getDateRange(selectedDate.value);

  // Fetch unified feed
  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    error,
  } = useUnifiedFeed({
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    address: walletAddress || undefined,
    range,
    // Only show minted content
    status: 'minted',
    // Apply post type filter
    postType: selectedPostType === 'all' ? undefined : selectedPostType,
    // Apply content type filters
    isPPV: contentFilters.ppv ? true : undefined,
    hasBounty: contentFilters.w2e ? true : undefined,
    isLocked: contentFilters.locked ? true : undefined,
  });

  // Fetch shorts separately for the carousel
  const { data: shortsData } = useDeHubVideos({
    unit: 10,
    address: walletAddress || undefined,
  });

  // Refetch when shuffleKey changes (pull-to-refresh)
  useEffect(() => {
    if (shuffleKey > 0) {
      refetch();
    }
  }, [shuffleKey, refetch]);

  // Map shorts data
  const shorts = useMemo((): ShortVideo[] => {
    if (!shortsData?.pages) return [];
    const allNFTs = shortsData.pages.flatMap(page => page.data || []);
    return allNFTs.slice(0, 10).map(mapNFTToShortVideo);
  }, [shortsData]);

  // Map unified feed items to component-ready data
  const items = useMemo((): FeedItemType[] => {
    if (!feedData?.pages) return [];
    
    const allItems = feedData.pages.flatMap(page => page.items || []);
    
    return allItems.map((item, index): FeedItemType => {
      switch (item.postType) {
        case 'feed-images':
          return { type: 'image', data: mapToImagePost(item, index) };
        case 'feed-simple':
          return { type: 'post', data: mapToTextPost(item, index) };
        case 'video':
        default:
          return { type: 'video', data: mapToVideoItem(item, index) };
      }
    });
  }, [feedData]);

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

  const renderFeedItem = (item: FeedItemType, index: number) => {
    switch (item.type) {
      case 'post':
        return <PostCard key={`post-${item.data.id}-${index}`} post={item.data} />;
      case 'video':
        return <VideoCard key={`video-${item.data.id}-${index}`} video={item.data} />;
      case 'image':
        return <ImageCard key={`image-${item.data.id}-${index}`} post={item.data} />;
      case 'shorts':
        return <ShortsReel key={`shorts-${index}`} shorts={item.data} />;
      default:
        return null;
    }
  };

  // Render feed items with shorts carousel inserted after every N posts
  const renderFeedWithShorts = () => {
    const elements: React.ReactNode[] = [];
    let shortsInserted = false;

    items.forEach((item, index) => {
      elements.push(renderFeedItem(item, index));

      // Insert shorts carousel after every SHORTS_INSERT_INTERVAL posts
      if ((index + 1) % SHORTS_INSERT_INTERVAL === 0 && shorts.length > 0) {
        elements.push(
          <ShortsReel key={`shorts-carousel-${index}`} shorts={shorts} />
        );
        shortsInserted = true;
      }
    });

    // If we have items but haven't inserted shorts yet (less than 6 items), add at the end
    if (items.length > 0 && items.length < SHORTS_INSERT_INTERVAL && shorts.length > 0 && !shortsInserted) {
      elements.push(
        <ShortsReel key="shorts-carousel-end" shorts={shorts} />
      );
    }

    return elements;
  };

  const isLoadingState = isLoading || isRefreshing;

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <RefreshCw className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Content Yet</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? `Unable to load feed. ${error?.message || 'Please try again.'}`
          : 'Be the first to share something amazing!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  );

  return (
    <div className="p-2 sm:p-3 space-y-3">
      {isLoadingState ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      ) : (
        <>
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
                <div className="bg-zinc-900 rounded-2xl p-4 mb-3">
                  <SortFilterSection 
                    selectedSort={selectedSort} 
                    onSortSelect={setSelectedSort}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    selectedPostType={selectedPostType}
                    onPostTypeSelect={setSelectedPostType}
                    contentFilters={contentFilters}
                    onContentFilterToggle={toggleContentFilter}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <StoriesBar users={storyUsers} />
          
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <div key={`${selectedSort.value}-${selectedDate.value}`} className="space-y-3">
              {renderFeedWithShorts()}
              
              {/* Infinite scroll loader */}
              <div ref={loaderRef} className="py-4 flex justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                )}
                {!hasNextPage && items.length > 0 && (
                  <p className="text-zinc-500 text-sm">You've reached the end 🎉</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
