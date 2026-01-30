/**
 * Home Feed Component
 * ===================
 * Mixed content feed using the unified /api/feed endpoint.
 * Renders videos, images, and text posts based on postType.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Radio, ChevronRight } from 'lucide-react';
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
import { getMediaUrl, getNFTInfo } from '@/lib/api/dehub';
import { getStationsByGenre, type RadioStation } from '@/lib/api/radio-browser';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { RadioStationCard } from '@/components/app/radio/RadioStationCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

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
const SHORTS_INSERT_INTERVAL = 5;
const RADIO_INSERT_AFTER = 15;

interface HomeFeedProps {
  shuffleKey: number;
  isRefreshing: boolean;
  showFilters?: boolean;
  /** Optional post ID to pin at the top of the feed */
  pinnedPostId?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

function formatViews(count?: number): string {
  if (!count) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  
  return `${Math.floor(diffDays / 365)}y`;
}

function mapNFTToShortVideo(nft: any): ShortVideo {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  const viewCount = nft.views || nft.view_count || nft.nft?.views || nft.nft?.view_count || 0;
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
    username: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    avatar: avatarUrl || (minterAddress ? `https://api.dicebear.com/7.x/identicon/svg?seed=${minterAddress}` : undefined),
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

export function HomeFeed({ shuffleKey, isRefreshing, showFilters = false, pinnedPostId }: HomeFeedProps) {
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

  // Fetch radio stations for carousel
  const { data: radioStations = [] } = useQuery({
    queryKey: ['radio-stations-home'],
    queryFn: () => getStationsByGenre('top', 20),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch pinned post if provided
  const { data: pinnedPost, isLoading: isPinnedLoading } = useQuery({
    queryKey: ['pinned-post', pinnedPostId],
    queryFn: () => getNFTInfo(pinnedPostId!),
    enabled: !!pinnedPostId,
    staleTime: 5 * 60 * 1000,
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

  // Convert pinned post (DeHubNFT) to feed item format
  const pinnedItem = useMemo((): FeedItemType | null => {
    if (!pinnedPost) return null;
    
    const id = String(pinnedPost.tokenId);
    const views = pinnedPost.views || pinnedPost.view_count || 0;
    const timeAgo = pinnedPost.createdAt ? formatTimeAgo(pinnedPost.createdAt) : 'Just now';
    
    // Determine post type - DeHubNFT uses "video" | "image" | "audio"
    const nftPostType = pinnedPost.postType || 'video';
    
    if (nftPostType === 'image' || (pinnedPost.imageUrls && pinnedPost.imageUrls.length > 0 && !pinnedPost.videoUrl)) {
      // Image post
      const imageUrls = buildFeedImageUrls(pinnedPost.imageUrls);
      const image = imageUrls?.[0] || buildImageUrl(pinnedPost.tokenId, pinnedPost.imageUrl);
      const avatar = pinnedPost.minterAvatarUrl 
        ? buildAvatarUrl(pinnedPost.minter, pinnedPost.minterAvatarUrl) || 'user'
        : 'user';
      
      const imagePost: ImagePost = {
        id,
        type: 'image',
        username: pinnedPost.minterDisplayName || pinnedPost.mintername || 'unknown',
        verified: false,
        avatar,
        image,
        imageUrls,
        title: pinnedPost.name,
        description: pinnedPost.description,
        likes: pinnedPost.totalVotes?.for || pinnedPost.like_count || 0,
        caption: pinnedPost.description || pinnedPost.name || '',
        comments: pinnedPost.commentCount || pinnedPost.comment_count || 0,
        views: formatViews(views),
        timeAgo,
        creatorId: pinnedPost.minter,
        creatorUsername: pinnedPost.mintername,
        isLiked: pinnedPost.isLiked ?? false,
      };
      return { type: 'image', data: imagePost };
    } else if (pinnedPost.videoUrl || pinnedPost.media_url) {
      // Video post
      const thumbnail = buildImageUrl(pinnedPost.tokenId, pinnedPost.imageUrl);
      const videoUrl = buildVideoUrl(pinnedPost.tokenId);
      const channelAvatar = pinnedPost.minterAvatarUrl 
        ? buildAvatarUrl(pinnedPost.minter, pinnedPost.minterAvatarUrl) || 'user'
        : 'user';
      
      const videoItem: VideoItem = {
        id,
        type: 'video',
        thumbnail,
        videoUrl,
        duration: formatDuration(pinnedPost.videoDuration || pinnedPost.duration || 0),
        title: pinnedPost.name || 'Untitled',
        channel: pinnedPost.minterDisplayName || pinnedPost.mintername || 'Unknown Creator',
        channelAvatar,
        verified: false,
        views: formatViews(views),
        uploadedAgo: timeAgo,
        creatorId: pinnedPost.minter,
        creatorUsername: pinnedPost.mintername,
        isLiked: pinnedPost.isLiked ?? false,
        likeCount: pinnedPost.totalVotes?.for || pinnedPost.like_count || 0,
        dislikeCount: pinnedPost.totalVotes?.against || pinnedPost.dislike_count || 0,
        commentCount: pinnedPost.commentCount || pinnedPost.comment_count || 0,
        isPPV: pinnedPost.is_ppv ?? false,
        isW2E: pinnedPost.is_w2e ?? false,
        isLocked: pinnedPost.is_locked ?? false,
      };
      return { type: 'video', data: videoItem };
    } else {
      // Text post
      const avatarUrl = pinnedPost.minterAvatarUrl 
        ? buildAvatarUrl(pinnedPost.minter, pinnedPost.minterAvatarUrl) || pinnedPost.minter
        : pinnedPost.minter;
      
      const textPost: TextPost = {
        id,
        type: 'post',
        author: {
          id: pinnedPost.minter,
          name: pinnedPost.minterDisplayName || pinnedPost.mintername || 'Unknown',
          handle: pinnedPost.mintername || pinnedPost.minter,
          avatarSeed: avatarUrl,
          verified: false,
        },
        content: pinnedPost.description || pinnedPost.name || '',
        createdAt: timeAgo,
        views: formatViews(views),
        stats: {
          comments: pinnedPost.commentCount || pinnedPost.comment_count || 0,
          reposts: 0,
          likes: pinnedPost.totalVotes?.for || pinnedPost.like_count || 0,
        },
      };
      return { type: 'post', data: textPost };
    }
  }, [pinnedPost]);

  // Map unified feed items to component-ready data (excluding pinned post)
  const items = useMemo((): FeedItemType[] => {
    if (!feedData?.pages) return [];
    
    const allItems = feedData.pages.flatMap(page => page.items || []);
    
    // Filter out the pinned post from regular feed to avoid duplicate
    const filteredItems = pinnedPostId 
      ? allItems.filter(item => String(item.tokenId) !== String(pinnedPostId))
      : allItems;
    
    return filteredItems.map((item, index): FeedItemType => {
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
  }, [feedData, pinnedPostId]);

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

  // Radio carousel component for home feed
  const RadioCarouselSection = () => {
    if (radioStations.length === 0) return null;
    
    return (
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5" />
            Radio Stations
            <span className="text-zinc-500 font-normal text-sm">(50K)</span>
          </h3>
          <button className="text-zinc-400 text-sm hover:text-white flex items-center gap-1">
            See all <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
            {radioStations.slice(0, 10).map((station) => (
              <div key={station.stationuuid} className="flex-shrink-0 w-[280px]">
                <RadioStationCard station={station} />
              </div>
            ))}
          </SwipeableCarousel>
        </div>
      </div>
    );
  };

  // Render feed items with shorts and radio carousels inserted
  const renderFeedWithShorts = () => {
    const elements: React.ReactNode[] = [];
    let shortsInserted = false;
    let radioInserted = false;

    items.forEach((item, index) => {
      elements.push(renderFeedItem(item, index));

      // Insert shorts carousel after every SHORTS_INSERT_INTERVAL posts (5)
      if ((index + 1) % SHORTS_INSERT_INTERVAL === 0 && shorts.length > 0 && !shortsInserted) {
        elements.push(
          <ShortsReel key={`shorts-carousel-${index}`} shorts={shorts} />
        );
        shortsInserted = true;
      }

      // Insert radio carousel after RADIO_INSERT_AFTER posts (15)
      if ((index + 1) === RADIO_INSERT_AFTER && radioStations.length > 0 && !radioInserted) {
        elements.push(
          <RadioCarouselSection key={`radio-carousel-${index}`} />
        );
        radioInserted = true;
      }
    });

    // If we have items but haven't inserted shorts yet (less than 5 items), add at the end
    if (items.length > 0 && items.length < SHORTS_INSERT_INTERVAL && shorts.length > 0 && !shortsInserted) {
      elements.push(
        <ShortsReel key="shorts-carousel-end" shorts={shorts} />
      );
    }

    return elements;
  };

  const isLoadingState = isLoading || isRefreshing || (pinnedPostId && isPinnedLoading);

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
    <div className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-3">
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

          <div className="pt-2">
            <StoriesBar users={storyUsers} />
          </div>
          
          {items.length === 0 && !pinnedItem ? (
            <EmptyState />
          ) : (
            <div key={`${selectedSort.value}-${selectedDate.value}`} className="space-y-3">
              {/* Render pinned post first if available */}
              {pinnedItem && renderFeedItem(pinnedItem, -1)}
              
              {/* Rest of the feed */}
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
