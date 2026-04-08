import { useState, useEffect, useRef } from 'react';

const TOP_THRESHOLD = 60;

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const touchStartY = useRef(0);
  const visRef = useRef(true);

  const show = () => { if (!visRef.current) { visRef.current = true;  setVisible(true);  } };
  const hide = () => { if (visRef.current)  { visRef.current = false; setVisible(false); } };

  useEffect(() => {
    const getY = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    lastScrollY.current = getY();

    // ── scroll events: attach to every possible container ──────────────────
    const onScroll = () => {
      const y = getY();
      const diff = y - lastScrollY.current;
      lastScrollY.current = y;
      if (y <= TOP_THRESHOLD) { show(); return; }
      if (diff > 4)  hide();
      if (diff < -4) show();
    };

    // ── touch events: most reliable on iOS/Android ──────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = getY();
      if (y <= TOP_THRESHOLD) { show(); return; }
      const moved = touchStartY.current - e.touches[0].clientY;
      if (moved > 15)  hide();   // swiping up   → scrolling down → hide
      if (moved < -15) show();   // swiping down → scrolling up   → show
    };

    // Attach scroll to all candidates — no matter which one is the real container
    const targets: EventTarget[] = [
      window,
      document,
      document.documentElement,
      document.body,
    ];
    // Also attach to the app root div (overflow-x-clip may make it the scroll container)
    const appRoot = document.getElementById('app-root');
    if (appRoot) targets.push(appRoot);
    targets.forEach(t => t.addEventListener('scroll', onScroll, { passive: true }));
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove',  onTouchMove,  { passive: true });

    return () => {
      targets.forEach(t => t.removeEventListener('scroll', onScroll));
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
    };
  }, []);

  return visible;
}
