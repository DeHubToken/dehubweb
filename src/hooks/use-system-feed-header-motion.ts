import { useLayoutEffect, type RefObject } from 'react';

/** The logo bar and glass pill share the APK's single header translation. */
export function useSystemFeedHeaderMotion(
  navRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  hidden: boolean,
) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return;

    const root = document.documentElement;
    const measure = () => {
      const top = Number.parseFloat(getComputedStyle(nav).top) || 0;
      const offset = hidden ? -(nav.offsetHeight + Math.max(0, top)) : 0;
      root.style.setProperty('--system-feed-header-offset', `${offset}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--system-feed-header-offset');
    };
  }, [navRef, enabled, hidden]);
}
