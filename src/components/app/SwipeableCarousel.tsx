/**
 * Swipeable Carousel Wrapper
 * ==========================
 * Wraps horizontal scrollable content and stops touch event propagation
 * to prevent parent swipe gesture handlers (like tab switching) from
 * capturing the carousel swipe.
 */

import { useRef, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SwipeableCarouselProps {
  children: ReactNode;
  className?: string;
  /** Show right fade gradient */
  showFade?: boolean;
  /** Fade gradient color - defaults to zinc-900 */
  fadeColor?: string;
}

export function SwipeableCarousel({ 
  children, 
  className,
  showFade = true,
  fadeColor = 'from-zinc-900'
}: SwipeableCarouselProps) {
  const isHorizontalSwipe = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = Math.abs(e.touches[0].clientX - startX.current);
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);
    
    // If horizontal movement is greater than vertical, it's a horizontal swipe
    if (deltaX > deltaY && deltaX > 10) {
      isHorizontalSwipe.current = true;
      // Stop propagation to prevent parent tab switching
      e.stopPropagation();
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isHorizontalSwipe.current) {
      e.stopPropagation();
    }
    isHorizontalSwipe.current = false;
  }, []);

  return (
    <div className="relative">
      {showFade && (
        <div className={cn(
          "absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l to-transparent pointer-events-none z-10",
          fadeColor
        )} />
      )}
      <div
        className={cn("overflow-x-auto scrollbar-hide", className)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
