/**
 * Home Feed Component
 * ===================
 * Mixed content feed with infinite scroll for the home tab.
 * Fetches content from DeHub API with sorting options.
 * 
 * @module components/app/feeds/HomeFeed
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS, applySorting, filterByDate, type SortOption, type DateFilterOption } from '@/lib/feed-utils';

// Card components
import { 
  PostCard, 
  VideoCard, 
  ImageCard, 
  LiveCard, 
  ShortsReel, 
  StoriesBar 
} from '@/components/app/cards';

// DeHub API hook
import { useDeHubFeed, useDeHubStoryUsers, useDeHubVideos, useDeHubImages, mapNFTToVideoItem, mapNFTToImagePost } from '@/hooks/use-dehub-feed';
import { getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

import type { VideoItem, ImagePost, TextPost, LiveStream, ShortVideo } from '@/types/feed.types';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type UnifiedFeedItem = 
  | { type: 'post'; data: TextPost }
  | { type: 'video'; data: VideoItem }
  | { type: 'image'; data: ImagePost }
  | { type: 'live'; data: LiveStream }
  | { type: 'shorts'; data: ShortVideo[] };

// Sort options are imported from feed-utils

const PAGE_SIZE = 15;
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
  };
}

// ============================================================================
// FILTER SECTION COMPONENT
// ============================================================================

interface FilterSectionProps {
  selectedSort: SortOption;
  onSortSelect: (o: SortOption) => void;
  selectedDate: DateFilterOption;
  onDateSelect: (o: DateFilterOption) => void;
}

function SortFilterSection({ selectedSort, onSortSelect, selectedDate, onDateSelect }: FilterSectionProps) {
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
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HomeFeed({ shuffleKey, isRefreshing, showFilters = false }: HomeFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]);
  const [selectedDate, setSelectedDate] = useState<DateFilterOption>(DATE_FILTER_OPTIONS[0]);

  const { walletAddress } = useAuth();

  // Fetch story users from API
  const { storyUsers } = useDeHubStoryUsers(10);

  // Fetch videos from DeHub API
  const {
    data: videosData,
    fetchNextPage: fetchNextVideos,
    hasNextPage: hasNextVideos,
    isFetchingNextPage: isFetchingNextVideos,
    isLoading: isVideosLoading,
    isError: isVideosError,
    refetch: refetchVideos,
    error: videosError,
  } = useDeHubFeed({
    unit: PAGE_SIZE,
    address: walletAddress || undefined,
  });

  // Fetch images from DeHub API
  const {
    data: imagesData,
    fetchNextPage: fetchNextImages,
    hasNextPage: hasNextImages,
    isFetchingNextPage: isFetchingNextImages,
    isLoading: isImagesLoading,
    isError: isImagesError,
    refetch: refetchImages,
  } = useDeHubImages({
    unit: PAGE_SIZE,
    address: walletAddress || undefined,
  });

  // Fetch shorts separately for the carousel
  const { data: shortsData } = useDeHubVideos({
    unit: 10,
    address: walletAddress || undefined,
  });

  // Refetch when shuffleKey changes (pull-to-refresh)
  useEffect(() => {
    if (shuffleKey > 0) {
      refetchVideos();
      refetchImages();
    }
  }, [shuffleKey, refetchVideos, refetchImages]);

  // Map shorts data
  const shorts = useMemo((): ShortVideo[] => {
    if (!shortsData?.pages) return [];
    const allNFTs = shortsData.pages.flatMap(page => page.data || []);
    return allNFTs.slice(0, 10).map(mapNFTToShortVideo);
  }, [shortsData]);

  // Helper to determine content type from NFT
  const getContentType = (nft: DeHubNFT): 'video' | 'image' => {
    const postType = (nft as any).postType || '';
    if (postType === 'feed-images' || postType.includes('image')) return 'image';
    return 'video';
  };

  // Map API data to feed items - COMBINE all NFTs first, then sort together
  const items = useMemo((): UnifiedFeedItem[] => {
    // Get raw NFTs and tag them with their source type
    const rawVideoNFTs: DeHubNFT[] = videosData?.pages?.flatMap(page => page.data || []) || [];
    const rawImageNFTs: DeHubNFT[] = imagesData?.pages?.flatMap(page => page.data || []) || [];
    
    // Combine ALL NFTs into a single array
    const allNFTs: DeHubNFT[] = [...rawVideoNFTs, ...rawImageNFTs];
    
    // Apply date filtering to the combined array
    const filteredNFTs = filterByDate(allNFTs, selectedDate.value);
    
    // Apply sorting to the COMBINED filtered results - this ensures global ordering
    const sortedNFTs = applySorting(filteredNFTs, selectedSort.value);
    
    // Map each NFT to its correct type based on postType
    return sortedNFTs.map((nft, index) => {
      const contentType = getContentType(nft);
      if (contentType === 'image') {
        return {
          type: 'image' as const,
          data: mapNFTToImagePost(nft, index),
        };
      }
      return {
        type: 'video' as const,
        data: mapNFTToVideoItem(nft, index),
      };
    });
  }, [videosData, imagesData, selectedSort.value, selectedDate.value]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current) return;
    
    const hasNextPage = hasNextVideos || hasNextImages;
    const isFetchingNextPage = isFetchingNextVideos || isFetchingNextImages;

    if (!hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          if (hasNextVideos) fetchNextVideos();
          if (hasNextImages) fetchNextImages();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextVideos, hasNextImages, isFetchingNextVideos, isFetchingNextImages, fetchNextVideos, fetchNextImages]);

  // Derived loading states
  const isApiLoading = isVideosLoading || isImagesLoading;
  const isError = isVideosError || isImagesError;
  const error = videosError;
  const hasNextPage = hasNextVideos || hasNextImages;
  const isFetchingNextPage = isFetchingNextVideos || isFetchingNextImages;

  const renderFeedItem = (item: UnifiedFeedItem, index: number) => {
    switch (item.type) {
      case 'post':
        return <PostCard key={`post-${item.data.id}-${index}`} post={item.data} />;
      case 'video':
        return <VideoCard key={`video-${item.data.id}-${index}`} video={item.data} />;
      case 'image':
        return <ImageCard key={`image-${item.data.id}-${index}`} post={item.data} />;
      case 'live':
        return <LiveCard key={`live-${item.data.id}-${index}`} stream={item.data} />;
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

  const isLoading = isApiLoading || isRefreshing;

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
        onClick={() => { refetchVideos(); refetchImages(); }}
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  );

  return (
    <div className="p-2 sm:p-3 space-y-3">
      {isLoading ? (
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
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <StoriesBar users={storyUsers} />
          
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <div key={`${selectedSort.value}-${selectedDate.value}`}>
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
