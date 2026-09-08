import { useEffect } from 'react';
import { useScrollDirection, useStickyNavVisibility } from '@/hooks/use-scroll-direction';
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
 * Oversized page pills marked `data-nav-return-top` use a separate depth-based
 * flag. They hide only after the page has scrolled far enough to replace their
 * full footprint with content, and remain hidden until the page reaches the
 * top. Ordinary pills keep the direction behavior, as do the Home pill and
 * mobile bottom navigation.
 *
 * `data-scroll-hidden` still carries scroll direction for the pinned search
 * pill: unlike the other pills it remains reachable mid-page and only closes
 * the mobile header gap.
 * The overlay half of the rule above is a mobile concern: on a wide screen the
 * dialog is centred and already scrims the pill, so folding overlays in there
 * would only add a visible slide behind the backdrop every time one opens.
 *
 * A third flag, `data-overlay-open`, splits those two halves back apart for
 * the pinned pills (`data-nav-hide='pin'`), which stay on screen through a
 * scroll but still have to clear an overlay's scrim. Neither of the other two
 * can tell the cases apart alone: `data-nav-hidden` is the OR of both, and
 * `data-scroll-hidden` stays true when an overlay opens over an already
 * scrolled page — the header slides back into view at that moment, and a pill
 * still riding the scroll would end up underneath it.
 *
 * Renders nothing; mount once, inside AppLayout.
 */
export function StickyNavHideSync(): null {
  const navVisible = useScrollDirection();
  const stickyNavVisible = useStickyNavVisibility();
  const anyOverlayOpen = useAnyOverlayOpen();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.navHidden = !navVisible || anyOverlayOpen ? 'true' : 'false';
    root.dataset.scrollHidden = navVisible ? 'false' : 'true';
    root.dataset.stickyNavHidden = !stickyNavVisible || anyOverlayOpen ? 'true' : 'false';
    root.dataset.stickyScrollHidden = stickyNavVisible ? 'false' : 'true';
    root.dataset.overlayOpen = anyOverlayOpen ? 'true' : 'false';
    return () => {
      delete root.dataset.navHidden;
      delete root.dataset.scrollHidden;
      delete root.dataset.stickyNavHidden;
      delete root.dataset.stickyScrollHidden;
      delete root.dataset.overlayOpen;
    };
  }, [navVisible, stickyNavVisible, anyOverlayOpen]);

  return null;
}
