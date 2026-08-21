import { useEffect } from 'react';
import { useScrollDirection } from '@/hooks/use-scroll-direction';
import { useAnyOverlayOpen } from '@/lib/overlay-open';

/**
 * Publishes the mobile chrome's hide state to <html> as `data-nav-hidden`.
 *
 * The mobile header and the bottom nav each read `useScrollDirection()`
 * themselves and translate off-screen on a scroll-down. The sticky page pill
 * every non-home page carries — `[data-feed-nav-outer]` — has to move with
 * them, and the pages that own one are exactly the pages PersistentPageCache
 * keeps mounted forever. Subscribing per page would re-render twenty-odd whole
 * pages on every direction flip, so the state is published once here and
 * applied in CSS (see the "Mobile chrome" block in index.css).
 *
 * Overlays count as hidden for the same reason the home feed treats them that
 * way: a drawer or dialog should own the screen on mobile, and the pill's z-50
 * otherwise floats it crisp above a dimmed scrim.
 *
 * A second flag, `data-scroll-hidden`, carries the scroll direction ALONE for
 * the pills that also ride the scroll on desktop (`data-nav-hide-desktop`).
 * The overlay half of the rule above is a mobile concern: on a wide screen the
 * dialog is centred and already scrims the pill, so folding overlays in there
 * would only add a visible slide behind the backdrop every time one opens.
 *
 * Renders nothing; mount once, inside AppLayout.
 */
export function StickyNavHideSync(): null {
  const navVisible = useScrollDirection();
  const anyOverlayOpen = useAnyOverlayOpen();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.navHidden = !navVisible || anyOverlayOpen ? 'true' : 'false';
    root.dataset.scrollHidden = navVisible ? 'false' : 'true';
    return () => {
      delete root.dataset.navHidden;
      delete root.dataset.scrollHidden;
    };
  }, [navVisible, anyOverlayOpen]);

  return null;
}
