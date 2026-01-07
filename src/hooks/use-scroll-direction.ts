import { useState, useEffect } from 'react';

interface UseScrollDirectionOptions {
  threshold?: number;
}

export function useScrollDirection({ threshold = 10 }: UseScrollDirectionOptions = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Always show nav at top of page
      if (currentScrollY < threshold) {
        setIsVisible(true);
        setLastScrollY(currentScrollY);
        return;
      }

      const scrollDiff = currentScrollY - lastScrollY;

      // Only update if scroll exceeds threshold to prevent jitter
      if (Math.abs(scrollDiff) >= threshold) {
        // Scrolling down = hide, scrolling up = show
        setIsVisible(scrollDiff < 0);
        setLastScrollY(currentScrollY);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY, threshold]);

  return isVisible;
}
