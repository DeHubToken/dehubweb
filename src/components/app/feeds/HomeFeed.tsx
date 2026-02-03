/**
 * Home Feed Component
 * ===================
 * Mixed content feed using the unified /api/feed endpoint.
 * Renders videos, images, and text posts based on postType.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Radio, ChevronRight } from 'lucide-react';
import { HomeFeedSkeleton, StoriesBarSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, CONTENT_TYPE_FILTERS, POST_TYPE_FILTERS, formatCount, formatViews, formatDuration, formatTimeAgo, type SortOption, type DateFilterOption, type ContentTypeFilters, type PostTypeFilterValue } from '@/lib/feed-utils';

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
import { useOptimisticPosts } from '@/hooks/use-optimistic-posts';
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
/** Number of pages to pre-fetch for random mode cross-page shuffling */
const RANDOM_PREFETCH_PAGES = 5;

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

/**
 * Fisher-Yates shuffle using true Math.random() for genuine randomness
 * This is called fresh on every render/refresh for unique ordering
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Maximum posts from the same creator in random mode to ensure diversity */
const MAX_POSTS_PER_CREATOR = 3;

/**
 * Get creator ID from a FeedItemType
 */
function getCreatorId(item: FeedItemType): string {
  switch (item.type) {
    case 'video':
      return item.data.creatorId || 'unknown';
    case 'image':
      return item.data.creatorId || 'unknown';
    case 'post':
      return item.data.author?.id || 'unknown';
    case 'shorts':
      return 'shorts'; // Shorts carousel is a special case
    default:
      return 'unknown';
  }
}

/**
 * Limit posts per creator to ensure feed diversity.
 * Returns items with at most MAX_POSTS_PER_CREATOR from each creator.
 */
function limitPostsPerCreator(items: FeedItemType[]): FeedItemType[] {
  const creatorCounts = new Map<string, number>();
  return items.filter(item => {
    const creatorId = getCreatorId(item);
    const count = creatorCounts.get(creatorId) || 0;
    if (count >= MAX_POSTS_PER_CREATOR) {
      return false;
    }
    creatorCounts.set(creatorId, count + 1);
    return true;
  });
}

/**
 * Balanced shuffle: ensures ~1 text post for every 3 media posts
 * Uses true Math.random() for genuine randomness on every call.
 * Interleaves text posts throughout the feed at regular intervals.
 * Also ensures no creator dominates the feed.
 */
function balancedShuffle(items: FeedItemType[]): FeedItemType[] {
  // First, limit posts per creator to prevent spam
  const diverseItems = limitPostsPerCreator(items);
  
  // Separate text posts from media posts
  const textPosts = diverseItems.filter(item => item.type === 'post');
  const mediaPosts = diverseItems.filter(item => item.type !== 'post');
  
  // Shuffle both arrays with true randomness
  const shuffledText = shuffleArray(textPosts);
  const shuffledMedia = shuffleArray(mediaPosts);
  
  // Interleave: insert 1 text post after every 3 media posts
  const result: FeedItemType[] = [];
  let textIndex = 0;
  let mediaIndex = 0;
  
  while (mediaIndex < shuffledMedia.length || textIndex < shuffledText.length) {
    // Add up to 3 media posts
    for (let i = 0; i < 3 && mediaIndex < shuffledMedia.length; i++) {
      result.push(shuffledMedia[mediaIndex++]);
    }
    
    // Add 1 text post if available
    if (textIndex < shuffledText.length) {
      result.push(shuffledText[textIndex++]);
    }
  }
  
  return result;
}

// Helper functions (formatCount, formatViews, formatDuration, formatTimeAgo) are now imported from @/lib/feed-utils

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
    creatorUsername: nft.mintername || nft.creator?.username || 'user',
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
  const isFetchingRef = useRef(false); // Synchronous fetch guard to prevent race conditions
  // Default to Random (first option)
  const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]); // Random
  const [selectedDate, setSelectedDate] = useState<DateFilterOption>(DATE_FILTER_OPTIONS[0]);
  const [selectedPostType, setSelectedPostType] = useState<PostTypeFilterValue>('all');
  const [contentFilters, setContentFilters] = useState<ContentTypeFilters>({
    ppv: false,
    w2e: false,
    locked: false,
  });
  
  // State to trigger re-shuffle on pull-to-refresh
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  
  // Stable shuffle refs - persist shuffled items to prevent re-shuffling on new pages
  const stableShuffledRef = useRef<FeedItemType[]>([]);
  const processedIdsRef = useRef<Set<string>>(new Set());
  
  // Track if we've pre-fetched enough pages for random mode
  // Persist in sessionStorage to prevent loading flash on back navigation
  const getInitialPreFetched = useCallback(() => {
    try {
      return sessionStorage.getItem('home-feed-prefetched') === 'true';
    } catch {
      return false;
    }
  }, []);
  const [hasPreFetched, setHasPreFetched] = useState(getInitialPreFetched);

  const toggleContentFilter = (filter: keyof ContentTypeFilters) => {
    setContentFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
  };

  const { walletAddress } = useAuth();
  const { optimisticPosts, clearOptimisticPosts } = useOptimisticPosts();

  // Fetch story users from API
  const { storyUsers } = useDeHubStoryUsers(10);

  // Build API params from filters
  // For 'random', we fetch latest and shuffle client-side
  const sortBy = useMemo(() => {
    switch (selectedSort.value) {
      case 'most-liked':
        return undefined; // API default
      case 'most-viewed':
        return 'views' as const;
      case 'most-comments':
        return 'comments' as const;
      case 'random':
        // Fetch latest, shuffle client-side
        return 'createdAt' as const;
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
    // Note: Don't pass address here - that filters to only that user's posts.
    // The auth token in the request header handles personalization (isLiked, etc.)
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
      // Trigger new shuffle and reset pre-fetch state
      setShuffleTrigger(prev => prev + 1);
      setHasPreFetched(false);
      // Clear persisted pre-fetch state on explicit refresh
      try {
        sessionStorage.removeItem('home-feed-prefetched');
      } catch {}
      // Reset stable shuffle refs for fresh shuffle
      stableShuffledRef.current = [];
      processedIdsRef.current = new Set();
      // Clear optimistic posts on refresh since real data should be available
      clearOptimisticPosts();
      refetch();
    }
  }, [shuffleKey, refetch, clearOptimisticPosts]);

  // Pre-fetch multiple pages for random mode to enable cross-page shuffling
  useEffect(() => {
    if (selectedSort.value !== 'random') {
      setHasPreFetched(true); // Non-random modes don't need pre-fetch
      return;
    }
    
    const currentPageCount = feedData?.pages?.length || 0;
    
    // If we have less than RANDOM_PREFETCH_PAGES and more are available, fetch next
    if (currentPageCount < RANDOM_PREFETCH_PAGES && hasNextPage && !isFetchingNextPage && !hasPreFetched) {
      fetchNextPage();
    } else if (currentPageCount >= RANDOM_PREFETCH_PAGES || !hasNextPage) {
      setHasPreFetched(true);
      // Persist pre-fetch state so back navigation doesn't trigger loading
      try {
        sessionStorage.setItem('home-feed-prefetched', 'true');
      } catch {}
    }
  }, [selectedSort.value, feedData?.pages?.length, hasNextPage, isFetchingNextPage, hasPreFetched, fetchNextPage]);

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

  // Helper to get unique ID from a feed item
  const getItemId = useCallback((item: FeedItemType): string => {
    switch (item.type) {
      case 'video':
      case 'image':
      case 'post':
        return item.data.id;
      case 'shorts':
        return `shorts-${item.data.map(s => s.id).join('-')}`;
      default:
        return `unknown-${Math.random()}`;
    }
  }, []);

  // Map unified feed items to component-ready data (excluding pinned post)
  const items = useMemo((): FeedItemType[] => {
    // Don't compute until pre-fetch is complete for random mode
    // This prevents multiple visual re-renders during sequential page fetches
    if (selectedSort.value === 'random' && !hasPreFetched) {
      return [];
    }
    
    if (!feedData?.pages) return [];
    
    const allItems = feedData.pages.flatMap(page => page.items || []);
    
    // Filter out the pinned post from regular feed to avoid duplicate
    const filteredItems = pinnedPostId 
      ? allItems.filter(item => String(item.tokenId) !== String(pinnedPostId))
      : allItems;
    
    const mappedItems = filteredItems.map((item, index): FeedItemType => {
      // Infer post type if not explicitly set by API
      const inferredType = item.postType || (
        item.videoUrl ? 'video' :
        (item.imageUrls && item.imageUrls.length > 0) ? 'feed-images' :
        'feed-simple'
      );
      
      switch (inferredType) {
        case 'feed-images':
          return { type: 'image', data: mapToImagePost(item, index) };
        case 'feed-simple':
          return { type: 'post', data: mapToTextPost(item, index) };
        case 'video':
        default:
          return { type: 'video', data: mapToVideoItem(item, index) };
      }
    });
    
    // For non-random modes, return as-is
    if (selectedSort.value !== 'random') {
      return mappedItems;
    }
    
    // STABLE SHUFFLE: Only shuffle NEW items and append to existing stable list
    // This prevents re-shuffling when loading more pages (looping issue)
    
    // Find items not yet processed
    const newItems = mappedItems.filter(item => {
      const id = getItemId(item);
      return !processedIdsRef.current.has(id);
    });
    
    // If no new items, return existing stable list
    if (newItems.length === 0) {
      return stableShuffledRef.current;
    }
    
    // Shuffle only the new items using balanced shuffle
    const shuffledNew = balancedShuffle(newItems);
    
    // Mark new items as processed
    shuffledNew.forEach(item => {
      processedIdsRef.current.add(getItemId(item));
    });
    
    // Append to stable list
    stableShuffledRef.current = [...stableShuffledRef.current, ...shuffledNew];
    
    return stableShuffledRef.current;
  }, [feedData, pinnedPostId, shuffleTrigger, selectedSort.value, hasPreFetched, getItemId]);

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

  const renderFeedItem = (item: FeedItemType, index: number) => {
    switch (item.type) {
      case 'post':
        return <PostCard key={`post-${item.data.id}`} post={item.data} />;
      case 'video':
        return <VideoCard key={`video-${item.data.id}`} video={item.data} />;
      case 'image':
        return <ImageCard key={`image-${item.data.id}`} post={item.data} />;
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

  // Show loading while pre-fetching pages for random mode
  // Check !hasPreFetched directly to cover all fetch states (not just during active fetch)
  const isPreFetchingRandom = selectedSort.value === 'random' && !hasPreFetched;
  
  // CRITICAL: Only show skeleton loader when we have NO cached data at all
  // This prevents the loading flash when returning from a post via back navigation
  // React Query keeps cached data, so we should show it immediately
  // Check feedData.pages directly as fallback if items is empty due to pre-fetch guard
  const hasQueryData = feedData?.pages && feedData.pages.length > 0;
  const hasCachedData = hasQueryData && items.length > 0;
  // Show loading during initial load OR during random pre-fetch without cached items
  const isLoadingState = (!hasQueryData && (isLoading || (pinnedPostId && isPinnedLoading))) 
    || (isPreFetchingRandom && !hasCachedData);

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
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
        <HomeFeedSkeleton />
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
          
          {items.length === 0 && !pinnedItem && optimisticPosts.length === 0 && !isPreFetchingRandom && !hasQueryData ? (
            <EmptyState />
          ) : (
            <div key={`${selectedSort.value}-${selectedDate.value}`} className="space-y-3">
              {/* Render optimistic posts first (newly created, not yet minted) */}
              {optimisticPosts.map((op) => {
                const feedItem: FeedItemType = { 
                  type: op.type, 
                  data: op.data as any 
                };
                return renderFeedItem(feedItem, -999);
              })}
              
              {/* Render pinned post if available */}
              {pinnedItem && renderFeedItem(pinnedItem, -1)}
              
              {/* Rest of the feed */}
              {renderFeedWithShorts()}
              
              {/* Infinite scroll loader */}
              <div ref={loaderRef} className="py-4 flex justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
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
