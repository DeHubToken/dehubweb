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

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, ChevronRight, ThumbsUp, Eye } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { ShortsViewer } from './ShortsViewer';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import type { ShortVideo } from '@/types/feed.types';
import { AutoplayVideo } from '@/components/app/AutoplayVideo';
import { cdnImage, deviceWidth, isMdUp } from '@/lib/media-url';

/**
 * Tile is `w-[120px] md:w-[180px]` below. Both the poster and the raw-image
 * fallback are sized from it, so the reel stops pulling full-width feed
 * posters for a thumbnail the width of a thumb.
 */
function tilePosterWidth(): number {
  return deviceWidth(isMdUp() ? 180 : 120);
}

/** Small squared-off avatar with image error fallback */
function ShortAvatar({ avatar, username }: { avatar?: string; username?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = avatar && !imgFailed;
  return (
    <div className="w-5 h-5 rounded-md bg-zinc-700 flex-shrink-0 overflow-hidden">
      {showImg ? (
        <img
          /* 20 CSS px. This came straight off the API untransformed, so the
             reel was pulling a full-size original per tile for a dot. */
          src={cdnImage(avatar, { width: deviceWidth(20), fit: 'cover' })}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-white text-[8px] font-medium">
          {username?.[0]?.toUpperCase()}
        </span>
      )}
    </div>
  );
}

interface ShortsReelProps {
  shorts: ShortVideo[];
}

export function ShortsReel({ shorts }: ShortsReelProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const posterWidth = tilePosterWidth();

  // There used to be a "pre-warm thumbnails" effect here that ran `new Image()`
  // over every short on mount. It was doing the opposite of its name:
  //
  //  - it warmed the RAW CDN url, while the tiles below render the TRANSFORMED
  //    one, so nothing it downloaded was ever reused — a measured 10 full-size
  //    originals (up to 1500x844) fetched and discarded per home-feed load;
  //  - it fetched every tile eagerly, defeating the `loading="lazy"` on the
  //    tiles themselves, in a horizontally-scrolling strip where most tiles
  //    start offscreen.
  //
  // The tiles' own lazy loading is the warm-up. An in-viewport lazy image is
  // fetched immediately, so the visible tiles are no slower for this.

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
                {short.videoUrl ? (
                  <AutoplayVideo
                    src={short.videoUrl}
                    poster={short.thumbnail}
                    className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                    threshold={0.3}
                    playbackGroup="shorts-reel"
                    posterWidth={posterWidth}
                  />
                ) : (
                  <img
                    src={cdnImage(short.thumbnail, { width: posterWidth })}
                    alt=""
                    className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                    /* The reel scrolls horizontally, so most of its tiles start
                       outside the viewport — and every full-size thumbnail they
                       pulled eagerly was competing with the LCP element. */
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                
                {/* Stats at bottom - using real views from API */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-white" />
                    <span className="text-white text-xs font-medium">{short.views || '0'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3 text-white" />
                    <span className="text-white text-xs font-medium">{short.likes}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </SwipeableCarousel>
      </div>

      {/* Full-screen Shorts Viewer - rendered via portal so the fixed overlay
          fills the viewport rather than being trapped inside a transformed
          feed ancestor (Framer Motion masonry wrappers apply inline transforms,
          which would otherwise become the containing block for position:fixed). */}
      {createPortal(
        <AnimatePresence>
          {viewerOpen && (
            <ShortsViewer
              shorts={shorts}
              initialIndex={selectedIndex}
              onClose={() => setViewerOpen(false)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
