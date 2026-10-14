import { useLayoutEffect, type RefObject } from 'react';

const OFFSET_VAR = '--system-feed-header-offset';

/**
 * The logo bar and glass pill share the APK's single header translation.
 *
 * The offset is written onto the two elements that read it, never onto
 * <html>: a custom property changed on the root is inherited by every node,
 * so each hide/show restyled the whole feed and
 * hitched the scroll at exactly the moment the bars moved.
 */
export function useSystemFeedHeaderMotion(
  navRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  hidden: boolean,
) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return;

    const targets = [nav, document.querySelector<HTMLElement>('[data-mobile-header]')];
    const measure = () => {
      const top = Number.parseFloat(getComputedStyle(nav).top) || 0;
      const offset = hidden ? -(nav.offsetHeight + Math.max(0, top)) : 0;
      for (const el of targets) el?.style.setProperty(OFFSET_VAR, `${offset}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      for (const el of targets) el?.style.removeProperty(OFFSET_VAR);
    };
  }, [navRef, enabled, hidden]);
}
