/**
 * ProfileImageGrid
 * ================
 * Instagram-style 3-column image grid for profile pages.
 * Unlocked when a user has 4+ image posts.
 */

import { useState, memo } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ImagePost } from '@/types/feed.types';
import { ImageCard } from '@/components/app/cards/ImageCard';

interface ProfileImageGridProps {
  images: ImagePost[];
}

export const ProfileImageGrid = memo(function ProfileImageGrid({ images }: ProfileImageGridProps) {
  const [selectedImage, setSelectedImage] = useState<ImagePost | null>(null);

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-0.5">
        {images.map((image) => (
          <button
            key={image.id}
            className="relative aspect-square overflow-hidden bg-white/[0.03] focus:outline-none"
            onClick={() => setSelectedImage(image)}
          >
            <img
              src={image.image}
              alt={image.description || image.caption || 'Image post'}
              className="w-full h-full object-cover transition-opacity hover:opacity-80"
              loading="lazy"
            />
          </button>
        ))}
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
