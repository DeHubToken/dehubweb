/**
 * Swipeable Carousel Wrapper
 * ==========================
 * Isolates horizontal touch and wheel events to prevent them from bubbling up
 * to parent containers (like HomePage tab switcher).
 *
 * Wrap any horizontally scrollable carousel with this component
 * to prevent swipe conflicts on mobile and trackpad swipes on desktop.
 *
 * Two mechanisms, deliberately both:
 *
 *  - `data-no-swipe` is the primary. HomePage's tab swipe checks
 *    `closest('[data-no-swipe]')` on *touchstart* and abandons the gesture for
 *    that touch entirely, so the page can never steal a drag that began inside
 *    a carousel.
 *  - stopPropagation below is the backstop. On its own it was not enough: it
 *    only engages once a touchmove has been seen crossing
 *    `deltaX > 10 && deltaX > deltaY`, so a fast flick — or one that arcs
 *    vertically before going sideways — could reach the tab handler first and
 *    flick between Home/Shorts mid-carousel-drag.
 *
 * @module components/app/SwipeableCarousel
 */

import { ReactNode, useRef, useCallback, forwardRef } from 'react';

interface SwipeableCarouselProps {
  children: ReactNode;
  className?: string;
  onScroll?: () => void;
}

export const SwipeableCarousel = forwardRef<HTMLDivElement, SwipeableCarouselProps>(
  function SwipeableCarousel({ children, className, onScroll }, ref) {
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const isHorizontalSwipe = useRef<boolean>(false);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isHorizontalSwipe.current = false;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Determine if this is a horizontal swipe (more X movement than Y)
      if (deltaX > deltaY && deltaX > 10) {
        isHorizontalSwipe.current = true;
        // Stop propagation to prevent parent tab switching
        e.stopPropagation();
      }
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      // If this was a horizontal swipe, stop propagation
      if (isHorizontalSwipe.current) {
        e.stopPropagation();
      }
      
      touchStartX.current = null;
      touchStartY.current = null;
      isHorizontalSwipe.current = false;
    }, []);

    // Block horizontal wheel events (trackpad swipes) from bubbling up
    const handleWheel = useCallback((e: React.WheelEvent) => {
      // If horizontal movement dominates, stop propagation
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 5) {
        e.stopPropagation();
      }
    }, []);

    return (
      <div
        ref={ref}
        data-no-swipe
        className={className}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onScroll={onScroll}
      >
        {children}
      </div>
    );
  }
);

export default SwipeableCarousel;
