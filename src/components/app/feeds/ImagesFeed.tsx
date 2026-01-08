/**
 * Images Feed Component
 * =====================
 * Displays image posts in collage or endless scroll view.
 * Uses centralized mock data and shared utilities.
 * 
 * @module components/app/feeds/ImagesFeed
 */

import { useRef, useMemo } from 'react';
import { Heart, MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageCard } from '@/components/app/cards';

import { SAMPLE_IMAGES } from '@/data/mock-feed.data';
import { shuffleArray } from '@/lib/feed-utils';
import type { ImagePost } from '@/types/feed.types';

// ============================================================================
// TYPES
// ============================================================================

interface ImagesFeedProps {
  showCollage?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CollageView({ posts }: { posts: ImagePost[] }) {
  return (
    <div className="p-1 sm:p-2">
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {posts.map((post, index) => {
          const isLargeTile = (index + 1) % 3 === 0 && index !== 0;
          
          return (
            <div
              key={post.id}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <Heart className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <MessageCircle className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndlessScrollView({ posts }: { posts: ImagePost[] }) {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      {posts.map((post) => (
        <ImageCard key={post.id} post={post} />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImagesFeed({ showCollage = false, isRefreshing = false, refreshKey = 0 }: ImagesFeedProps) {
  const hasAnimated = useRef(false);
  
  // Shuffle posts based on refreshKey using centralized data
  const shuffledPosts = useMemo(() => {
    return shuffleArray(SAMPLE_IMAGES, refreshKey);
  }, [refreshKey]);
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {showCollage ? (
        <motion.div
          key={`collage-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CollageView posts={shuffledPosts} />
        </motion.div>
      ) : (
        <motion.div
          key={`endless-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <EndlessScrollView posts={shuffledPosts} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
