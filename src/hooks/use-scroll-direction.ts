import { useState, useEffect, useRef } from 'react';

const TOP_THRESHOLD = 60;
const SCROLL_DIFF = 4;
const TOUCH_DIFF = 10;

function getScrollY() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    lastScrollY.current = getScrollY();

    const onScroll = () => {
      const currentY = getScrollY();

      if (currentY <= TOP_THRESHOLD) {
        setVisible(true);
        lastScrollY.current = currentY;
        return;
      }

      const diff = currentY - lastScrollY.current;
      if (Math.abs(diff) < SCROLL_DIFF) return;

      setVisible(diff < 0); // up = visible, down = hidden
      lastScrollY.current = currentY;
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentY = getScrollY();
      if (currentY <= TOP_THRESHOLD) {
        setVisible(true);
        return;
      }
      const diff = touchStartY.current - e.touches[0].clientY;
      if (diff > TOUCH_DIFF) setVisible(false);       // finger going up = scroll down
      else if (diff < -TOUCH_DIFF) setVisible(true);  // finger going down = scroll up
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return visible;
}
