/**
 * Fullscreen Image Viewer Component
 * ==================================
 * Displays images in fullscreen with original dimensions.
 * Supports swipe navigation for multi-image posts.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';

interface FullscreenImageViewerProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function FullscreenImageViewer({ 
  images, 
  initialIndex, 
  isOpen, 
  onClose 
}: FullscreenImageViewerProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: false, 
    startIndex: initialIndex 
  });
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Sync carousel to initial index when opening
  useEffect(() => {
    if (isOpen && emblaApi) {
      emblaApi.scrollTo(initialIndex, true);
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex, emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') scrollPrev();
      if (e.key === 'ArrowRight') scrollNext();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, scrollPrev, scrollNext]);

  const hasMultiple = images.length > 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-zinc-800/80 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
            aria-label="Close fullscreen"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image counter */}
          {hasMultiple && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-zinc-800/80 text-white text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Carousel */}
          <div 
            className="w-full h-full overflow-hidden" 
            ref={emblaRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full">
              {images.map((img, idx) => (
                <div 
                  key={idx} 
                  className="flex-[0_0_100%] min-w-0 h-full flex items-center justify-center p-4"
                >
                  <img
                    src={img}
                    alt=""
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              {currentIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollPrev();
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {currentIndex < images.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollNext();
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </>
          )}

          {/* Dot indicators */}
          {hasMultiple && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    emblaApi?.scrollTo(idx);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex
                      ? 'bg-white w-3'
                      : 'bg-white/50 hover:bg-white/70'
                  }`}
                  aria-label={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
