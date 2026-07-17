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
import { type ReactNode } from 'react';
import { useLocation, type Location } from 'react-router-dom';
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

export function SurfaceTransition({ children }: SurfaceTransitionProps) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const surface = getSurface(location.pathname);

  // Respect reduced-motion: render the live tree with no presence animation.
  if (reduceMotion) {
    return <>{children(location)}</>;
  }

  return (
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
  );
}
