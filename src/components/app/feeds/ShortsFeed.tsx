/**
 * Shorts Feed Component
 * =====================
 * Displays short-form video content from DeHub API.
 * 
 * @module components/app/feeds/ShortsFeed
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, RefreshCw, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { useDeHubVideos, mapNFTToVideoItem } from '@/hooks/use-dehub-feed';
import { getMediaUrl } from '@/lib/api/dehub';
import type { ShortVideo } from '@/types/feed.types';

const DURATION_OPTIONS = ['All', '< 15s', '15-60s', '> 60s'];
const CATEGORY_OPTIONS = ['All', 'Dance', 'Comedy', 'Food', 'Pets', 'Fitness', 'Magic'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];

// Map sort options to API params
const SORT_MAP: Record<string, 'latest' | 'popular' | 'trending'> = {
  'New to Old': 'latest',
  'Most Liked': 'popular',
  'Most Viewed': 'popular',
  'Most Commented': 'trending',
};

interface ShortsFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// Map video NFT to ShortVideo format
function mapToShortVideo(nft: any, index: number): ShortVideo {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  
  return {
    id,
    type: 'short',
    username: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    likes: formatLikes(nft.totalVotes?.for || nft.like_count || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || '',
    description: nft.description || nft.name || nft.title || '',
    sound: 'Original Sound',
    comments: formatLikes(nft.commentCount || nft.comment_count || 0),
    shares: formatLikes(Math.floor(Math.random() * 1000)),
  };
}

function formatLikes(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

export function ShortsFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: ShortsFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSort, setSelectedSort] = useState('New to Old');
  const [selectedUploadDate, setSelectedUploadDate] = useState('All Time');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch from DeHub API (using video type for shorts)
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
  } = useDeHubVideos({
    limit: 15,
    sort: SORT_MAP[selectedSort] || 'latest',
    category: selectedCategory !== 'All' ? selectedCategory.toLowerCase() : undefined,
  });

  // Refetch when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  // Map API data to ShortVideo array
  const shorts = useMemo(() => {
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapToShortVideo(nft, index));
  }, [apiData]);

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

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
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
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="p-2 sm:p-3">
        {/* Filters */}
        {showFilters && (
          <div className="mb-4 space-y-3">
            {/* Duration Filter */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
              <span className="text-zinc-400 text-sm whitespace-nowrap">Duration:</span>
              {DURATION_OPTIONS.map((duration) => (
                <button
                  key={duration}
                  onClick={() => setSelectedDuration(duration)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                    selectedDuration === duration
                      ? 'bg-white text-black font-medium'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {duration}
                </button>
              ))}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
              <span className="text-zinc-400 text-sm whitespace-nowrap">Category:</span>
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                    selectedCategory === category
                      ? 'bg-white text-black font-medium'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Sort Filter */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
              <span className="text-zinc-400 text-sm whitespace-nowrap">Sort:</span>
              {SORT_OPTIONS.map((sort) => (
                <button
                  key={sort}
                  onClick={() => setSelectedSort(sort)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                    selectedSort === sort
                      ? 'bg-white text-black font-medium'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {sort}
                </button>
              ))}
            </div>

            {/* Upload Date Filter */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
              <span className="text-zinc-400 text-sm whitespace-nowrap">Upload Date:</span>
              {UPLOAD_DATE_OPTIONS.map((date) => (
                <button
                  key={date}
                  onClick={() => setSelectedUploadDate(date)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                    selectedUploadDate === date
                      ? 'bg-white text-black font-medium'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {date}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shorts Grid or Empty State */}
        {shorts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Shorts Grid - TikTok Style */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
              {shorts.map((short, index) => (
                <motion.div
                  key={short.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: (index % 9) * 0.05 }}
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
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-semibold text-white text-sm">@{short.username}</span>
                      {short.verified && (
                        <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-white text-xs">{short.likes} likes</p>
                  </div>

                  {/* Play indicator on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </motion.div>
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
          </>
        )}
      </div>

      {/* Full-screen Shorts Viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <ShortsViewer
            shorts={shorts}
            initialIndex={selectedIndex}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
