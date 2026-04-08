import { useState, useEffect, useRef } from 'react';

const SCROLL_THRESHOLD = 6;
const TOP_THRESHOLD = 60;

function getScrollY(): number {
  return (
    window.scrollY ??
    document.documentElement.scrollTop ??
    document.body.scrollTop ??
    0
  );
}

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const lastVisible = useRef(true);

  useEffect(() => {
    lastScrollY.current = getScrollY();

    const update = () => {
      const currentY = getScrollY();
      const diff = currentY - lastScrollY.current;

      let next: boolean;
      if (currentY <= TOP_THRESHOLD) {
        next = true;
      } else if (diff > SCROLL_THRESHOLD) {
        next = false;
      } else if (diff < -SCROLL_THRESHOLD) {
        next = true;
      } else {
        lastScrollY.current = currentY;
        return;
      }

      lastScrollY.current = currentY;

      if (next !== lastVisible.current) {
        lastVisible.current = next;
        setVisible(next);
      }
    };

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return visible;
}
