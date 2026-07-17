import { useState, useEffect, useRef } from 'react';

const TOP_THRESHOLD = 60;

export function useScrollDirection() {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const touchLastY = useRef(0);
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
      touchLastY.current = e.touches[0].clientY;
      lastScrollY.current = getY();
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = getY();
      // Keep the scroll baseline fresh while the finger is down. iOS defers
      // `scroll` events during an active drag, so without this the first
      // post-momentum `scroll` diffs against a stale, pre-gesture position and
      // can (wrongly) re-hide the nav on the way back up.
      lastScrollY.current = y;
      const currentY = e.touches[0].clientY;
      // Delta since the LAST move, not the gesture start — so reversing
      // direction mid-drag flips show/hide immediately. Measuring from the
      // start left `moved` positive after a downward flick, so scrolling back
      // up within the same touch never re-showed the nav (the stuck bug).
      const moved = touchLastY.current - currentY;
      touchLastY.current = currentY;
      if (y <= TOP_THRESHOLD) { show(); return; }
      if (moved > 6)  hide();   // finger up   → scrolling down → hide
      if (moved < -6) show();   // finger down → scrolling up   → show
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
