/**
 * ProfileImageGrid
 * ================
 * Natural collage-style image grid for profile pages (matches public image feed).
 * Every 4th image spans 2×2 for visual flow. Tapping opens the full ImageCard.
 * Unlocked when a user has 4+ image posts.
 */

import { useState, memo } from 'react';
import { X, ThumbsUp, ThumbsDown, MessageSquare, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ImagePost } from '@/types/feed.types';
import { ImageCard } from '@/components/app/cards/ImageCard';

interface ProfileImageGridProps {
  images: ImagePost[];
}

export const ProfileImageGrid = memo(function ProfileImageGrid({ images }: ProfileImageGridProps) {
  const [selectedImage, setSelectedImage] = useState<ImagePost | null>(null);

  return (
    <>
      {/* Collage grid — matches public ImagesFeed CollageView */}
      <div
        className="grid grid-cols-3 gap-0.5 sm:gap-1 overflow-hidden rounded-xl"
        style={{ gridAutoFlow: 'dense' }}
      >
        {images.map((post, index) => {
          const isLargeTile = index % 4 === 0;

          return (
            <div
              key={post.id}
              onClick={() => setSelectedImage(post)}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt={post.description || post.caption || ''}
                className={cn(
                  "w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover:scale-105",
                  post.isPPV && "blur-lg"
                )}
                loading="lazy"
              />
              {/* PPV overlay */}
              {post.isPPV && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Ticket className="h-5 w-5 text-white" />
                  </div>
                </div>
              )}
              {/* Hover overlay with stats */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 sm:gap-5">
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded view overlay */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col overflow-y-auto"
            onClick={() => setSelectedImage(null)}
          >
            <div className="sticky top-0 z-10 flex justify-end p-3">
              <button
                className="h-8 w-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            <div
              className="flex-1 px-2 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
                <ImageCard post={selectedImage} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
