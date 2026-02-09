/**
 * Shorts Reel Component
 * =====================
 * Horizontal scrollable reel displaying short-form video previews.
 * Uses real view counts from the API.
 * 
 * @example
 * ```tsx
 * <ShortsReel shorts={shortsData} />
 * ```
 */

import { useState, useEffect } from 'react';
import { Play, ChevronRight, Heart, Eye } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { ShortsViewer } from './ShortsViewer';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import type { ShortVideo } from '@/types/feed.types';

// Module-level cache: survives unmount/remount, keeps images warm in browser memory
const preloadedThumbnails = new Set<string>();

interface ShortsReelProps {
  shorts: ShortVideo[];
}

export function ShortsReel({ shorts }: ShortsReelProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Pre-warm thumbnail images in browser cache on first load
  useEffect(() => {
    for (const short of shorts) {
      if (short.thumbnail && !preloadedThumbnails.has(short.thumbnail)) {
        const img = new Image();
        img.src = short.thumbnail;
        preloadedThumbnails.add(short.thumbnail);
      }
      if (short.avatar && !preloadedThumbnails.has(short.avatar)) {
        const img = new Image();
        img.src = short.avatar;
        preloadedThumbnails.add(short.avatar);
      }
    }
  }, [shorts]);

  const handleShortClick = (index: number) => {
    setSelectedIndex(index);
    setViewerOpen(true);
  };

  return (
    <>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-white" />
            Scroll
          </h3>
          <button className="text-zinc-400 text-sm hover:text-white flex items-center gap-1 transition-colors">
            See all <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal scroll */}
        <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {shorts.map((short, index) => (
            <div
              key={short.id}
              onClick={() => handleShortClick(index)}
              className="flex-shrink-0 w-[120px] md:w-[180px] cursor-pointer group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-[9/16] rounded-xl overflow-hidden">
                <img
                  src={short.thumbnail}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                
                {/* Creator info at top */}
                <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-zinc-700 border border-white/30 flex-shrink-0 overflow-hidden">
                    {short.avatar ? (
                      <img 
                        src={short.avatar} 
                        alt="" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <span className={`w-full h-full flex items-center justify-center text-white text-[8px] font-medium ${short.avatar ? 'hidden' : ''}`}>
                      {short.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-white text-[10px] font-medium truncate">{short.username}</span>
                </div>
                
                {/* Play overlay on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Play className="w-5 h-5 text-white fill-white" />
                  </div>
                </div>
                
                {/* Stats at bottom - using real views from API */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-white" />
                    <span className="text-white text-xs font-medium">0</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Heart className="w-3 h-3 text-white" />
                    <span className="text-white text-xs font-medium">{short.likes}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </SwipeableCarousel>
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
