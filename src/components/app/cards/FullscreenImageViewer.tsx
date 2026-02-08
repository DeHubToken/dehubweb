/**
 * Fullscreen Image Viewer Component
 * ==================================
 * Displays images in fullscreen with original dimensions.
 * Supports swipe navigation for multi-image posts.
 * Swipe/drag down to close.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { ImageTranslationSheet } from './ImageTranslationSheet';
import { useImageTranslation } from '@/hooks/use-image-translation';

interface FullscreenImageViewerProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const SWIPE_DOWN_THRESHOLD = 100;

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
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  
  // Image translation hook
  const { isLoading: isTranslating, error: translationError, result: translationResult, translateImage, clearResult } = useImageTranslation();
  
  // Drag state for swipe-down-to-close
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartX = useRef(0);
  
  const handleTranslateImage = useCallback(async () => {
    const imageUrl = images[currentIndex];
    if (!imageUrl) return;
    
    setShowTranslationSheet(true);
    await translateImage(imageUrl);
  }, [images, currentIndex, translateImage]);
  
  const handleCloseTranslation = useCallback(() => {
    setShowTranslationSheet(false);
    clearResult();
  }, [clearResult]);

  // Sync carousel to initial index when opening
  useEffect(() => {
    if (isOpen && emblaApi) {
      emblaApi.scrollTo(initialIndex, true);
      setCurrentIndex(initialIndex);
      setDragOffset(0);
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

  // Touch handlers for swipe-down-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    const deltaY = e.touches[0].clientY - dragStartY.current;
    const deltaX = Math.abs(e.touches[0].clientX - dragStartX.current);
    
    // Only allow downward drag, and only if vertical > horizontal
    if (deltaY > 0 && deltaY > deltaX) {
      setDragOffset(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > SWIPE_DOWN_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
    isDragging.current = false;
  }, [dragOffset, onClose]);

  // Mouse handlers for click-and-drag down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartX.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    
    const deltaY = e.clientY - dragStartY.current;
    const deltaX = Math.abs(e.clientX - dragStartX.current);
    
    if (deltaY > 0 && deltaY > deltaX) {
      setDragOffset(deltaY);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragOffset > SWIPE_DOWN_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
    isDragging.current = false;
  }, [dragOffset, onClose]);

  // Wheel handler for two-finger scroll down (trackpad)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Positive deltaY = scrolling down
    if (e.deltaY > SWIPE_DOWN_THRESHOLD && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      onClose();
    }
  }, [onClose]);

  const hasMultiple = images.length > 1;
  
  // Calculate opacity based on drag offset
  const bgOpacity = Math.max(0.3, 1 - dragOffset / 300);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity * 0.95})` }}
          onClick={onClose}
          onWheel={handleWheel}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            aria-label="Close fullscreen"
          >
            <X className="w-5 h-5" />
          </button>
          
          {/* Translate button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTranslateImage();
            }}
            className="absolute top-4 right-16 z-10 w-10 h-10 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            aria-label="Translate image text"
          >
            <Languages className="w-5 h-5" />
          </button>

          {/* Image counter */}
          {hasMultiple && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 text-white text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Carousel with drag offset */}
          <motion.div 
            className="w-full h-full overflow-hidden" 
            ref={emblaRef}
            style={{ 
              transform: `translateY(${dragOffset}px)`,
              opacity: Math.max(0.5, 1 - dragOffset / 200)
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="flex h-full">
              {images.map((img, idx) => (
                <div 
                  key={idx} 
                  className="flex-[0_0_100%] min-w-0 h-full flex items-center justify-center p-4"
                  onClick={onClose}
                >
                  <img
                    src={img}
                    alt=""
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Navigation arrows – hidden on mobile/tablet, swipe to navigate instead */}
          {hasMultiple && (
            <>
              {currentIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollPrev();
                  }}
                  className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 items-center justify-center text-white hover:bg-black/80 transition-colors"
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
                  className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 items-center justify-center text-white hover:bg-black/80 transition-colors"
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
          
          {/* Image Translation Sheet */}
          <ImageTranslationSheet
            isOpen={showTranslationSheet}
            onClose={handleCloseTranslation}
            isLoading={isTranslating}
            error={translationError}
            result={translationResult}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
