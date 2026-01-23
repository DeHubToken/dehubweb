/**
 * Videos Feed Component
 * =====================
 * Displays a grid/list of video content with filtering options.
 * Fetches from DeHub API. Uses the shared VideoCard component.
 * 
 * Features:
 * - Viewport-based rendering (only renders videos near viewport)
 * - Automatic cleanup of off-screen video resources
 * - Infinite scroll with windowing for memory efficiency
 * 
 * @module components/app/feeds/VideosFeed
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Loader2, RefreshCw, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubVideos, mapNFTToVideoItem } from '@/hooks/use-dehub-feed';

// ============================================================================
// TYPES
// ============================================================================

interface VideosFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// Maximum number of video cards to render at once for memory efficiency
const MAX_RENDERED_VIDEOS = 30;

// ============================================================================
// CONSTANTS
// ============================================================================

const DURATION_OPTIONS = ['0-1m', '1-4m', '4-20m', '20m+'];
const SORT_OPTIONS = ['New to Old', 'Most Liked', 'Most Viewed', 'Most Commented'];
const UPLOAD_DATE_OPTIONS = ['1d', '1w', '1y', 'All Time'];
const CATEGORY_PILLS = ['All', 'PPV', 'W2E', 'Programming', 'Web Dev', 'JavaScript', 'React', 'Python', 'Gaming', 'Music'];

const SORT_MAP: Record<string, 'new' | 'popular' | 'trending'> = {
  'New to Old': 'new',
  'Most Liked': 'popular',
  'Most Viewed': 'popular',
  'Most Commented': 'trending',
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface FilterSectionProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

function FilterSection({ label, options, selected, onSelect }: FilterSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              selected === option
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideosFeed({ showFilters = false, isRefreshing = false, refreshKey = 0 }: VideosFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [selectedUploadDate, setSelectedUploadDate] = useState(UPLOAD_DATE_OPTIONS[3]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: MAX_RENDERED_VIDEOS });
  const loaderRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress } = useAuth();

  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
  } = useDeHubVideos({
    unit: 15,
    sortMode: SORT_MAP[selectedSort] || 'new',
    category: selectedCategory !== 'All' ? selectedCategory.toLowerCase() : undefined,
    address: walletAddress || undefined,
  });

  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
      // Reset visible range on refresh
      setVisibleRange({ start: 0, end: MAX_RENDERED_VIDEOS });
    }
  }, [refreshKey, refetch]);

  const videos = useMemo(() => {
    if (!apiData?.pages) return [];
    const allNFTs = apiData.pages.flatMap(page => page.data || []);
    return allNFTs.map((nft, index) => mapNFTToVideoItem(nft, index));
  }, [apiData]);

  // Windowing: only render videos in the visible range for memory efficiency
  const visibleVideos = useMemo(() => {
    return videos.slice(visibleRange.start, visibleRange.end);
  }, [videos, visibleRange]);

  // Update visible range based on scroll position
  const updateVisibleRange = useCallback(() => {
    if (!feedContainerRef.current) return;
    
    const container = feedContainerRef.current;
    const scrollTop = window.scrollY - container.offsetTop;
    const viewportHeight = window.innerHeight;
    const cardHeight = 400; // Approximate height of a video card
    const buffer = 5; // Number of cards to keep rendered above/below viewport
    
    const firstVisibleIndex = Math.max(0, Math.floor(scrollTop / cardHeight) - buffer);
    const lastVisibleIndex = Math.min(
      videos.length,
      Math.ceil((scrollTop + viewportHeight) / cardHeight) + buffer
    );
    
    // Ensure we always render at least MAX_RENDERED_VIDEOS or all if less
    const rangeSize = Math.max(MAX_RENDERED_VIDEOS, lastVisibleIndex - firstVisibleIndex);
    
    setVisibleRange(prev => {
      // Only update if significant change to avoid re-renders
      if (Math.abs(prev.start - firstVisibleIndex) > 3 || Math.abs(prev.end - (firstVisibleIndex + rangeSize)) > 3) {
        return { start: firstVisibleIndex, end: firstVisibleIndex + rangeSize };
      }
      return prev;
    });
  }, [videos.length]);

  // Throttled scroll handler
  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateVisibleRange();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [updateVisibleRange]);

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

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
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
        className="px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );

  if (isRefreshing || isApiLoading) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3" ref={feedContainerRef}>
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
            <div className="bg-zinc-900 rounded-2xl p-4 mb-3 space-y-4">
              <FilterSection label="Duration" options={DURATION_OPTIONS} selected={selectedDuration} onSelect={setSelectedDuration} />
              <FilterSection label="Sort" options={SORT_OPTIONS} selected={selectedSort} onSelect={setSelectedSort} />
              <FilterSection label="Upload Date" options={UPLOAD_DATE_OPTIONS} selected={selectedUploadDate} onSelect={setSelectedUploadDate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills */}
      <div className="bg-zinc-900 rounded-2xl p-3 mb-3">
        <div className="relative">
          {/* Right fade only */}
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1">
            {CATEGORY_PILLS.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  selectedCategory === cat ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Video Grid or Empty State */}
      {videos.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Spacer for items before visible range */}
          {visibleRange.start > 0 && (
            <div style={{ height: visibleRange.start * 400 }} aria-hidden="true" />
          )}
          
          <div className="space-y-3">
            {visibleVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          
          {/* Spacer for items after visible range */}
          {visibleRange.end < videos.length && (
            <div style={{ height: (videos.length - visibleRange.end) * 400 }} aria-hidden="true" />
          )}

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
        </>
      )}
    </div>
  );
}
