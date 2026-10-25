import { useEffect, useState, type RefObject } from 'react';
import { isTabletPortraitFeed } from '@/lib/tablet-portrait-feed';

export function useTabletPortraitFeed(ref: RefObject<HTMLDivElement>, enabled: boolean): boolean {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const card = ref.current;
    const main = card?.closest('[data-main-panel]');
    // The normal home feed only, never a post page, carousel or mosaic tile.
    if (!enabled || !card || !main || !card.closest('[data-feed-root]')) {
      setFits(false);
      return;
    }
    const update = () => {
      const rect = main.getBoundingClientRect();
      const hasSidePanels = rect.left > 1 || rect.width < window.innerWidth - 2;
      setFits(isTabletPortraitFeed(window.innerWidth, card.getBoundingClientRect().width, hasSidePanels));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    observer.observe(main);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, enabled]);
  return enabled && fits;
}
