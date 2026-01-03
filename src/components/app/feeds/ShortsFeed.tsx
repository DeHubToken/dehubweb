import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { SAMPLE_SHORTS } from '@/data/mock-feed.data';
import type { ShortVideo } from '@/types/feed.types';

const DURATION_OPTIONS = ['All', '< 15s', '15-60s', '> 60s'];
const CATEGORY_OPTIONS = ['All', 'Dance', 'Comedy', 'Food', 'Pets', 'Fitness', 'Magic'];

interface ShortsFeedProps {
  showFilters?: boolean;
}

export function ShortsFeed({ showFilters = false }: ShortsFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
          {SAMPLE_SHORTS.map((short, index) => (
            <div
              key={short.id}
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
            </div>
          ))}
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
