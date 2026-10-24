/**
 * SurfaceTransition
 * =================
 * Wraps the router's `<Routes>` and plays the choreographed app↔docs slide.
 *
 * Keyed by SURFACE (see getSurface), so only crossing the app↔docs boundary
 * animates; navigation within a surface stays instant. `mode="wait"` holds the
 * outgoing surface mounted through its exit (panels slide off + shell fades),
 * THEN mounts the incoming one (docs panel slides in) — the "slide off, then
 * slide in after" sequence.
 *
 * The children render-prop receives the CURRENT `location`. Passing it straight
 * into `<Routes location={loc}>` is what lets the exiting surface stay frozen
 * on its last page: AnimatePresence keeps the previous element (with its old
 * `location`) mounted, and `<Routes location>` publishes that frozen location
 * to the whole subtree (AppLayout, PersistentPageCache, …) via router context —
 * so the feed doesn't blank out mid-slide.
 */
import { useDeferredValue, type ReactNode } from 'react';
import { useLocation, type Location } from 'react-router-dom';
import { DeHubLoader } from '@/components/app/DeHubLoader';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  getSurface,
  surfaceWrapperVariants,
  SURFACE_ENTER,
  SURFACE_CENTER,
  SURFACE_EXIT,
} from '@/lib/surface-motion';

interface SurfaceTransitionProps {
  children: (location: Location) => ReactNode;
}

/**
 * The tap's answer while the next page renders. Fixed and click-through, so it
 * never moves the page under it; fades in after a beat, so a page that is
 * ready within a frame or two never flashes it.
 */
function NavigationPending() {
  return (
    <div
      role="status"
      aria-label="Loading"
      data-navigation-pending
      className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center"
    >
      <DeHubLoader size={56} className="[animation-delay:80ms]" />
    </div>
  );
}

export function SurfaceTransition({ children }: SurfaceTransitionProps) {
  // The page tree renders from a deferred copy of the location. A tap used to
  // render the whole next page inside the click, one 200-600ms block before
  // anything could paint, so the screen sat frozen on the old page. Now the
  // click commits at once (the spinner above), and the next page renders in
  // the background without holding the screen; a page whose code is still
  // downloading keeps the old one on screen with the spinner instead of
  // blanking it.
  const liveLocation = useLocation();
  const location = useDeferredValue(liveLocation);
  const pending = location !== liveLocation;
  const reduceMotion = useReducedMotion();
  const surface = getSurface(location.pathname);

  // Respect reduced-motion: render the live tree with no presence animation.
  if (reduceMotion) {
    return <>{children(location)}{pending && <NavigationPending />}</>;
  }

  return (
    <>
    {pending && <NavigationPending />}
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={surface}
        data-surface={surface}
        variants={surfaceWrapperVariants}
        initial={SURFACE_ENTER}
        animate={SURFACE_CENTER}
        exit={SURFACE_EXIT}
        // Opacity-only wrapper: never a transform/filter, so it can't become a
        // containing block for the fixed background canvas or mini-players.
        style={{ transformOrigin: 'center top' }}
      >
        {children(location)}
      </motion.div>
    </AnimatePresence>
    </>
  );
}
