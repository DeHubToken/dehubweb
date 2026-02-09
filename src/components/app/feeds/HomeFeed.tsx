/**
 * Home Feed Component
 * ===================
 * Mixed content feed with custom content ordering pattern.
 * Fetches videos, images, and text posts separately then interleaves
 * according to a 50-item repeating pattern.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Radio, ChevronRight } from 'lucide-react';
import { HomeFeedSkeleton, StoriesBarSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  SORT_OPTIONS, 
  DATE_FILTER_OPTIONS, 
  CONTENT_TYPE_FILTERS, 
  POST_TYPE_FILTERS, 
  formatCount, 
  formatViews, 
  formatDuration, 
  formatTimeAgo, 
  CONTENT_PATTERN,
  interleaveByPattern,
  calculateTrendingScore,
  shuffleWithinBuckets,
  limitCreatorDiversity,
  DEFAULT_MAX_POSTS_PER_CREATOR,
  DEFAULT_MIN_CREATOR_SPACING,
  type SortOption, 
  type DateFilterOption, 
  type ContentTypeFilters, 
  type PostTypeFilterValue 
} from '@/lib/feed-utils';

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
import { usePersistedFeedFilter, usePersistedContentFilters } from '@/hooks/use-persisted-feed-filter';
import { getMediaUrl, getNFTInfo, getAccountInfo } from '@/lib/api/dehub';
import { getStationsByGenre, type RadioStation } from '@/lib/api/radio-browser';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useOptimisticPosts } from '@/hooks/use-optimistic-posts';
import { RadioStationCard } from '@/components/app/radio/RadioStationCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { MobileWhoToFollowCarousel } from '@/components/app/mobile';

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
const RADIO_INSERT_AFTER = 12;
/** Insert an all-time most-liked post every N items in trending feed */
const CLASSIC_INSERT_INTERVAL = 6;

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

function mapNFTToShortVideo(nft: any): ShortVideo {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  const viewCount = nft.views || nft.view_count || nft.nft?.views || nft.nft?.view_count || 0;
  const minterAddress = nft.minter || nft.creator?.id || nft.creator?.address || '';
  
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
    likes: String(nft.totalVotes?.for || nft.like_count || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || '',
    description: nft.description || nft.name || nft.title || '',
    sound: 'Original Sound',
    comments: formatCount(nft.commentCount || nft.comment_count || 0),
    shares: '0',
    views: formatCount(viewCount),
    creatorUsername: nft.mintername || nft.creator?.username || 'user',
    creatorId: minterAddress,
    displayName: nft.minterDisplayName || undefined,
  };
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
  onReset: () => void;
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
  onReset,
}: FilterSectionProps) {
  return (
    <div className="relative flex flex-col gap-4">
      {/* Sort Options */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Sort</span>
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => onSortSelect(option)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedSort.label === option.label
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>
      
      {/* Date Filter Options */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Upload Date</span>
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
            {DATE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onDateSelect(option)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedDate.value === option.value
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Post Type Filter */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Post Type</span>
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
            {POST_TYPE_FILTERS.map((option) => (
              <button
                key={option.value}
                onClick={() => onPostTypeSelect(option.value)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  selectedPostType === option.value
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Content Type Filters */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Content Access</span>
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
            {CONTENT_TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => onContentFilterToggle(filter.value)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  contentFilters[filter.value]
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Reset filters - bottom right */}
      <button
        onClick={onReset}
        className="absolute bottom-0 right-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        aria-label="Reset filters"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HomeFeed({ shuffleKey, isRefreshing, showFilters = false, pinnedPostId }: HomeFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  
  // Default to Trending (first option) - persisted to sessionStorage
  const [selectedSort, setSelectedSort] = usePersistedFeedFilter<SortOption>('home', 'sort', SORT_OPTIONS[0]);
  const [selectedDate, setSelectedDate] = usePersistedFeedFilter<DateFilterOption>('home', 'date', DATE_FILTER_OPTIONS[0]);
  const [selectedPostType, setSelectedPostType] = usePersistedFeedFilter<PostTypeFilterValue>('home', 'postType', 'all');
  const [contentFilters, toggleContentFilter, resetContentFilters] = usePersistedContentFilters('home');

  const { walletAddress, isAuthenticated } = useAuth();
  const { optimisticPosts, clearOptimisticPosts } = useOptimisticPosts();

  // Fetch story users from API
  const { storyUsers } = useDeHubStoryUsers(10);

  // Fetch current user's following list for "Following" feed filter
  const { data: currentUserData } = useQuery({
    queryKey: ['current-user-followings', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      return getAccountInfo(walletAddress);
    },
    enabled: isAuthenticated && !!walletAddress && selectedSort.value === 'following',
    staleTime: 30000,
  });

  // Get following list as a Set for O(1) lookups
  const followingSet = useMemo(() => {
    const followings = currentUserData?.followings;
    if (!followings || !Array.isArray(followings)) return new Set<string>();
    return new Set(followings.map(addr => addr.toLowerCase()));
  }, [currentUserData?.followings]);

  // Handle sort selection with special logic for "Subscribed" (coming soon)
  const handleSortSelect = useCallback((option: SortOption) => {
    if (option.value === 'subscribed') {
      toast.info('Subscribed feed coming soon!', {
        description: 'This feature is under development.',
      });
      return;
    }
    if (option.value === 'following' && !isAuthenticated) {
      toast.info('Log in to see posts from creators you follow');
      return;
    }
    setSelectedSort(option);
  }, [isAuthenticated]);

  // Build API params from filters
  // For trending, we fetch by recency (last month) then sort client-side
  const sortBy = useMemo(() => {
    switch (selectedSort.value) {
      case 'trending':
      case 'following': // Following uses latest sort, filtered client-side
        return 'createdAt' as const; // Fetch recent, apply trending score client-side
      case 'most-liked':
        return 'likes' as const;
      case 'most-viewed':
        return 'views' as const;
      case 'most-comments':
        return 'comments' as const;
      case 'random':
        return 'random' as const;
      case 'latest':
      default:
        return 'createdAt' as const;
    }
  }, [selectedSort.value]);

  const sortOrder: 'asc' | 'desc' = 'desc'; // Always sort descending (highest first)
  
  // For trending and following, don't limit range - let pagination go back in time naturally
  // The trending algorithm's time decay will still prioritize recent content at the top
  const range = useMemo(() => {
    if (selectedSort.value === 'trending' || selectedSort.value === 'following' || selectedSort.value === 'random') {
      return undefined; // No range limit
    }
    return getDateRange(selectedDate.value);
  }, [selectedSort.value, selectedDate.value]);

  // Common API params for all three feeds
  const commonParams = useMemo(() => ({
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    range,
    status: 'minted' as const,
    isPPV: contentFilters.ppv ? true : undefined,
    hasBounty: contentFilters.w2e ? true : undefined,
    isLocked: contentFilters.locked ? true : undefined,
  }), [sortBy, sortOrder, range, contentFilters]);

  // ============================================================================
  // THREE SEPARATE FEED QUERIES
  // ============================================================================

  // For "Most Liked", "Trending", or "Following" sorting, we need global ranking across all types
  // So we use a single unified feed instead of three separate type feeds
  const useSingleFeedForGlobalSort = selectedSort.value === 'most-liked' || selectedSort.value === 'trending' || selectedSort.value === 'following' || selectedSort.value === 'random';
  const useInterleavedFeed = selectedPostType === 'all' && !useSingleFeedForGlobalSort;

  // Fetch videos
  const videosFeed = useUnifiedFeed({
    ...commonParams,
    postType: 'video',
    enabled: useInterleavedFeed,
  });

  // Fetch images
  const imagesFeed = useUnifiedFeed({
    ...commonParams,
    postType: 'feed-images',
    enabled: useInterleavedFeed,
  });

  // Fetch text posts
  const textsFeed = useUnifiedFeed({
    ...commonParams,
    postType: 'feed-simple',
    enabled: useInterleavedFeed,
  });

  // Fallback: single unified feed when post type filter is active OR using global sort
  const singleFeed = useUnifiedFeed({
    ...commonParams,
    postType: selectedPostType === 'all' ? undefined : selectedPostType,
    enabled: !useInterleavedFeed,
  });

  // For trending: also fetch all-time most-liked to sprinkle in classic hits
  const classicsFeed = useUnifiedFeed({
    limit: PAGE_SIZE,
    sortBy: 'likes',
    sortOrder: 'desc',
    status: 'minted' as const,
    enabled: selectedSort.value === 'trending' && selectedPostType === 'all',
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
      clearOptimisticPosts();
      if (useInterleavedFeed) {
        videosFeed.refetch();
        imagesFeed.refetch();
        textsFeed.refetch();
      } else {
        singleFeed.refetch();
      }
    }
  }, [shuffleKey, useInterleavedFeed, clearOptimisticPosts]);

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
    
    const nftPostType = pinnedPost.postType || 'video';
    
    if (nftPostType === 'image' || (pinnedPost.imageUrls && pinnedPost.imageUrls.length > 0 && !pinnedPost.videoUrl)) {
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

  // ============================================================================
  // INTERLEAVED ITEMS (from three separate feeds)
  // ============================================================================

  const interleavedItems = useMemo((): FeedItemType[] => {
    if (!useInterleavedFeed) return [];
    
    // Extract all items from each feed
    const allVideos = videosFeed.data?.pages.flatMap(page => page.items || []) || [];
    const allImages = imagesFeed.data?.pages.flatMap(page => page.items || []) || [];
    const allTexts = textsFeed.data?.pages.flatMap(page => page.items || []) || [];
    
    // Filter out pinned post from all feeds
    const filterPinned = (items: any[]) => 
      pinnedPostId ? items.filter(item => String(item.tokenId) !== String(pinnedPostId)) : items;
    
    const filteredVideos = filterPinned(allVideos);
    const filteredImages = filterPinned(allImages);
    const filteredTexts = filterPinned(allTexts);
    
    // Map to component types
    const mappedVideos = filteredVideos.map((item, i) => mapToVideoItem(item, i));
    const mappedImages = filteredImages.map((item, i) => mapToImagePost(item, i));
    const mappedTexts = filteredTexts.map((item, i) => mapToTextPost(item, i));
    
    // Interleave according to pattern
    const interleaved = interleaveByPattern(mappedVideos, mappedImages, mappedTexts, CONTENT_PATTERN);
    
    // Convert to FeedItemType
    return interleaved.map(item => {
      switch (item.type) {
        case 'video':
          return { type: 'video' as const, data: item.data };
        case 'image':
          return { type: 'image' as const, data: item.data };
        case 'text':
          return { type: 'post' as const, data: item.data };
      }
    });
  }, [useInterleavedFeed, videosFeed.data, imagesFeed.data, textsFeed.data, pinnedPostId]);

  // ============================================================================
  // SINGLE FEED ITEMS (when post type filter is active OR global sort mode)
  // ============================================================================

  const singleFeedItems = useMemo((): FeedItemType[] => {
    if (useInterleavedFeed || !singleFeed.data?.pages) return [];
    
    let allItems = singleFeed.data.pages.flatMap(page => page.items || []);
    
    // Filter out pinned post
    const filteredItems = pinnedPostId 
      ? allItems.filter(item => String(item.tokenId) !== String(pinnedPostId))
      : allItems;
    
    // For trending mode: sort by trending score, then shuffle within buckets for variety
    let sortedItems = filteredItems;
    if (selectedSort.value === 'trending') {
      const trendingSorted = [...filteredItems].sort((a, b) => {
        return calculateTrendingScore(b) - calculateTrendingScore(a);
      });
      // Light shuffle: items with similar scores swap positions (bucket size of 5)
      sortedItems = shuffleWithinBuckets(trendingSorted, 5);
    }
    
    // Map to feed item types
    const mapItem = (item: any, index: number): FeedItemType => {
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
    };
    
    // For trending: blend in all-time most-liked posts every CLASSIC_INSERT_INTERVAL items
    if (selectedSort.value === 'trending' && classicsFeed.data?.pages) {
      const classicItems = classicsFeed.data.pages.flatMap(page => page.items || []);
      // Filter out items already in trending feed and pinned post
      const trendingIds = new Set(sortedItems.map(item => String(item.tokenId)));
      const uniqueClassics = classicItems.filter(item => 
        !trendingIds.has(String(item.tokenId)) && 
        String(item.tokenId) !== String(pinnedPostId)
      );
      
      const result: FeedItemType[] = [];
      let classicIdx = 0;
      
      sortedItems.forEach((item, index) => {
        result.push(mapItem(item, index));
        
        // Insert a classic post every CLASSIC_INSERT_INTERVAL items
        if ((index + 1) % CLASSIC_INSERT_INTERVAL === 0 && classicIdx < uniqueClassics.length) {
          result.push(mapItem(uniqueClassics[classicIdx], 1000 + classicIdx));
          classicIdx++;
        }
      });
      
      return result;
    }
    
    return sortedItems.map(mapItem);
  }, [useInterleavedFeed, singleFeed.data, pinnedPostId, selectedSort.value, classicsFeed.data]);

  // Final items to render with creator diversity limiting
  // This ensures users see content from a variety of creators (max 2 per creator in view)
  const rawItems = useInterleavedFeed ? interleavedItems : singleFeedItems;
  
  const items = useMemo(() => {
    let filteredItems = rawItems;
    
    // For "Following" mode, filter to only show posts from followed creators
    if (selectedSort.value === 'following' && followingSet.size > 0) {
      filteredItems = rawItems.filter((item) => {
        let creatorId: string | undefined;
        switch (item.type) {
          case 'post':
            creatorId = item.data.author?.id;
            break;
          case 'video':
            creatorId = item.data.creatorId;
            break;
          case 'image':
            creatorId = item.data.creatorId;
            break;
          default:
            return true; // Keep shorts bundles
        }
        return creatorId ? followingSet.has(creatorId.toLowerCase()) : false;
      });
    }
    
    return limitCreatorDiversity(
      filteredItems,
      DEFAULT_MAX_POSTS_PER_CREATOR,
      (item) => {
        // Extract creator ID based on item type
        switch (item.type) {
          case 'post':
            return item.data.author?.id;
          case 'video':
            return item.data.creatorId;
          case 'image':
            return item.data.creatorId;
          case 'shorts':
            // Shorts are a bundle, no single creator
            return undefined;
          default:
            return undefined;
        }
      },
      DEFAULT_MIN_CREATOR_SPACING
    );
  }, [rawItems, selectedSort.value, followingSet]);

  // ============================================================================
  // INFINITE SCROLL
  // ============================================================================

  // Determine if any feed has more content
  const hasNextPage = useInterleavedFeed 
    ? (videosFeed.hasNextPage || imagesFeed.hasNextPage || textsFeed.hasNextPage)
    : singleFeed.hasNextPage;

  const isFetchingNextPage = useInterleavedFeed
    ? (videosFeed.isFetchingNextPage || imagesFeed.isFetchingNextPage || textsFeed.isFetchingNextPage)
    : singleFeed.isFetchingNextPage;

  const isLoading = useInterleavedFeed
    ? (videosFeed.isLoading || imagesFeed.isLoading || textsFeed.isLoading)
    : singleFeed.isLoading;

  const isError = useInterleavedFeed
    ? (videosFeed.isError || imagesFeed.isError || textsFeed.isError)
    : singleFeed.isError;

  const refetch = useCallback(() => {
    if (useInterleavedFeed) {
      videosFeed.refetch();
      imagesFeed.refetch();
      textsFeed.refetch();
    } else {
      singleFeed.refetch();
    }
  }, [useInterleavedFeed, videosFeed, imagesFeed, textsFeed, singleFeed]);

  // Fetch next page from all feeds that have more content
  const fetchNextPage = useCallback(() => {
    const promises: Promise<any>[] = [];
    
    if (useInterleavedFeed) {
      if (videosFeed.hasNextPage && !videosFeed.isFetchingNextPage) {
        promises.push(videosFeed.fetchNextPage());
      }
      if (imagesFeed.hasNextPage && !imagesFeed.isFetchingNextPage) {
        promises.push(imagesFeed.fetchNextPage());
      }
      if (textsFeed.hasNextPage && !textsFeed.isFetchingNextPage) {
        promises.push(textsFeed.fetchNextPage());
      }
    } else {
      if (singleFeed.hasNextPage && !singleFeed.isFetchingNextPage) {
        promises.push(singleFeed.fetchNextPage());
      }
    }
    
    return Promise.all(promises);
  }, [useInterleavedFeed, videosFeed, imagesFeed, textsFeed, singleFeed]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
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

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderFeedItem = (item: FeedItemType, index: number) => {
    const card = (() => {
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
    })();

    // Wrap non-shorts items in a bento container
    if (item.type === 'shorts' || !card) return card;

    const key = item.type === 'post' ? `bento-post-${item.data.id}`
              : item.type === 'video' ? `bento-video-${(item.data as VideoItem).id}`
              : `bento-image-${(item.data as ImagePost).id}`;

    return (
      <div key={key} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
        {card}
      </div>
    );
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
    let whoToFollowInserted = false;

    items.forEach((item, index) => {
      elements.push(renderFeedItem(item, index));

      // Insert Who to Follow carousel after 3 posts (mobile/tablet only)
      if ((index + 1) === 3 && !whoToFollowInserted) {
        elements.push(
          <MobileWhoToFollowCarousel key={`who-to-follow-${index}`} />
        );
        whoToFollowInserted = true;
      }

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

  // Determine loading state
  const hasQueryData = useInterleavedFeed
    ? (videosFeed.data?.pages?.length || imagesFeed.data?.pages?.length || textsFeed.data?.pages?.length)
    : (singleFeed.data?.pages?.length);
  const hasCachedData = hasQueryData && items.length > 0;
  const isLoadingState = !hasQueryData && (isLoading || (pinnedPostId && isPinnedLoading));

  const EmptyState = () => {
    // Custom message for Following feed
    const isFollowingMode = selectedSort.value === 'following';
    const hasNoFollowings = followingSet.size === 0;
    
    let title = 'No Content Yet';
    let description = isError 
      ? 'Unable to load feed. Please try again.'
      : 'Be the first to share something amazing!';
    
    if (isFollowingMode) {
      if (hasNoFollowings) {
        title = 'No Followed Creators';
        description = 'Follow some creators to see their posts here!';
      } else {
        title = 'No Posts Yet';
        description = 'The creators you follow haven\'t posted anything recently.';
      }
    }
    
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
          <RefreshCw className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
        <p className="text-zinc-400 text-sm max-w-xs mb-4">{description}</p>
        <button 
          onClick={refetch}
          className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  };

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
                    onSortSelect={handleSortSelect}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    selectedPostType={selectedPostType}
                    onPostTypeSelect={setSelectedPostType}
                    contentFilters={contentFilters}
                    onContentFilterToggle={toggleContentFilter}
                    onReset={() => {
                      setSelectedSort(SORT_OPTIONS[0]);
                      setSelectedDate(DATE_FILTER_OPTIONS[0]);
                      setSelectedPostType('all');
                      resetContentFilters();
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2">
            <StoriesBar users={storyUsers} shorts={shorts} />
          </div>
          
          {items.length === 0 && !pinnedItem && optimisticPosts.length === 0 && !hasQueryData ? (
            <EmptyState />
          ) : (
            <div key={`${selectedSort.value}-${selectedDate.value}-${selectedPostType}`} className="space-y-3">
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
