import { useState, useEffect, useRef, useCallback } from 'react';
import { Music2, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { SAMPLE_SHORTS } from '@/data/mock-feed.data';
import type { ShortVideo } from '@/types/feed.types';

const DURATION_OPTIONS = ['All', '< 15s', '15-60s', '> 60s'];
const CATEGORY_OPTIONS = ['All', 'Dance', 'Comedy', 'Food', 'Pets', 'Fitness', 'Magic'];
const ITEMS_PER_PAGE = 9;

interface ShortsFeedProps {
  showFilters?: boolean;
}

export function ShortsFeed({ showFilters = false }: ShortsFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [displayedCount, setDisplayedCount] = useState(ITEMS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const displayedShorts = SAMPLE_SHORTS.slice(0, displayedCount);
  const hasMore = displayedCount < SAMPLE_SHORTS.length;

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      setDisplayedCount(prev => Math.min(prev + ITEMS_PER_PAGE, SAMPLE_SHORTS.length));
      setIsLoading(false);
    }, 500);
  }, [isLoading, hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const handleShortClick = (index: number) => {
    setSelectedIndex(index);
    setViewerOpen(true);
  };

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
        </div>
        )}

        {/* Shorts Grid - TikTok Style */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
          {displayedShorts.map((short, index) => (
            <motion.div
              key={short.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: (index % ITEMS_PER_PAGE) * 0.05 }}
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
          {isLoading && (
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          )}
          {!hasMore && displayedCount > ITEMS_PER_PAGE && (
            <p className="text-zinc-500 text-sm">No more shorts to load</p>
          )}
        </div>
      </div>

      {/* Full-screen Shorts Viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <ShortsViewer
            shorts={SAMPLE_SHORTS}
            initialIndex={selectedIndex}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
