import { useState, useEffect, useRef } from 'react';

const SCROLL_THRESHOLD = 8;
const TOP_THRESHOLD = 50;

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const diff = currentY - lastScrollY.current;

        if (currentY < TOP_THRESHOLD) {
          setVisible(true);
        } else if (diff > SCROLL_THRESHOLD) {
          setVisible(false);
        } else if (diff < -SCROLL_THRESHOLD) {
          setVisible(true);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return visible;
}
