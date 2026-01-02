/**
 * Shorts Reel Component
 * =====================
 * Horizontal scrollable reel displaying short-form video previews.
 * 
 * @example
 * ```tsx
 * <ShortsReel shorts={shortsData} />
 * ```
 */

import { Play, ChevronRight, Heart } from 'lucide-react';
import type { ShortVideo } from '@/types/feed.types';

interface ShortsReelProps {
  shorts: ShortVideo[];
}

export function ShortsReel({ shorts }: ShortsReelProps) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Play className="w-4 h-4 text-red-500" />
          Shorts
        </h3>
        <button className="text-red-400 text-sm hover:underline flex items-center gap-1">
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {shorts.map((short) => (
          <div
            key={short.id}
            className="flex-shrink-0 w-[120px] cursor-pointer group"
          >
            {/* Thumbnail */}
            <div className="relative aspect-[9/16] rounded-xl overflow-hidden mb-2">
              <img
                src={short.thumbnail}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              
              {/* Play overlay on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </div>
              
              {/* Likes */}
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <Heart className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">{short.likes}</span>
              </div>
            </div>

            {/* Username */}
            <p className="text-white text-xs truncate">@{short.username}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
