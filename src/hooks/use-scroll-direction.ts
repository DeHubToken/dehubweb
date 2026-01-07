import { useState, useEffect, useRef } from 'react';

interface UseScrollDirectionOptions {
  threshold?: number;
}

export function useScrollDirection({ threshold = 10 }: UseScrollDirectionOptions = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Always show nav at top of page
      if (currentScrollY < threshold) {
        setIsVisible(true);
        lastScrollY.current = currentScrollY;
        return;
      }

      const scrollDiff = currentScrollY - lastScrollY.current;

      // Only update if scroll exceeds threshold to prevent jitter
      if (Math.abs(scrollDiff) >= threshold) {
        // Scrolling down = hide, scrolling up = show
        setIsVisible(scrollDiff < 0);
        lastScrollY.current = currentScrollY;
      }
    };

    // Listen to both window scroll and touch events for better mobile support
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [threshold]);

  return isVisible;
}
