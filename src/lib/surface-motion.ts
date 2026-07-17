/**
 * Surface transition motion
 * ==========================
 * Shared variant definitions + helpers for the "game-like" transition between
 * the app shell and the full-page docs/blog surface.
 *
 * HOW IT WORKS
 * ------------
 * `SurfaceTransition` wraps the router's `<Routes>` in an `AnimatePresence`
 * `mode="wait"` keyed by SURFACE ('app' vs 'docs') — so intra-app navigation
 * (e.g. /app → /app/settings) never animates, only crossing the app↔docs
 * boundary does. The wrapper animates OPACITY ONLY (never transform) so it can
 * never become a containing block for the fixed background / mini-players.
 *
 * The individual panels slide via framer-motion VARIANT INHERITANCE: the
 * surface wrapper sets `animate="center"` / `exit="exit"`, and any descendant
 * `motion.*` that defines matching variant labels (the left rail, the right
 * bento column, the docs sidebar) inherits the label and plays its own move.
 * Components that don't define these labels simply ignore them, so this is safe
 * to layer over the existing framer usage across the app.
 *
 * `mode="wait"` is what produces the user-facing sequence: the app panels slide
 * OFF and the shell fades, THEN — once that completes — the docs surface fades
 * in and its left panel slides in. "Slide off … then slide in after."
 */
import { useSyncExternalStore } from 'react';
import type { Variants } from 'framer-motion';

export type Surface = 'app' | 'docs';

/**
 * Docs and the community blog (both /docs/* and the canonical /guides/* blog
 * URLs) are the full-page "docs" surface; everything else is the app shell.
 */
export function getSurface(pathname: string): Surface {
  if (pathname.startsWith('/docs') || pathname.startsWith('/guides')) return 'docs';
  return 'app';
}

// Smooth, slightly overshooting ease for things sliding IN; sharper ease for
// things leaving. Matches the app's existing spring-y feel without a bouncy
// spring (springs on `x: '-115%'` percentages are jittery).
const EASE_IN_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EASE_OUT_FAST: [number, number, number, number] = [0.4, 0, 1, 1];

// Distinctive variant labels (not 'enter'/'exit') so that inheriting the label
// via framer's MotionContext only ever animates the panels that opt in — any
// other `motion.*` in the app tree simply won't define these keys and ignores
// them. SurfaceTransition drives initial/animate/exit with these same strings.
export const SURFACE_ENTER = 'surfaceEnter';
export const SURFACE_CENTER = 'surfaceCenter';
export const SURFACE_EXIT = 'surfaceExit';

/** Whole-surface wrapper — opacity only (safe for fixed/sticky descendants). */
export const surfaceWrapperVariants: Variants = {
  surfaceEnter: { opacity: 0 },
  surfaceCenter: { opacity: 1, transition: { duration: 0.3, ease: EASE_IN_OUT } },
  surfaceExit: { opacity: 0, transition: { duration: 0.26, ease: EASE_OUT_FAST } },
};

/** Left rail (desktop-only `hidden lg:flex`) — slides off/in to the left. */
export const leftRailVariants: Variants = {
  surfaceEnter: { x: '-115%' },
  surfaceCenter: { x: 0, transition: { duration: 0.42, ease: EASE_IN_OUT, delay: 0.02 } },
  surfaceExit: { x: '-115%', transition: { duration: 0.32, ease: EASE_OUT_FAST } },
};

/** Right bento column (desktop-only `hidden lg:block`) — slides off/in right. */
export const rightRailVariants: Variants = {
  surfaceEnter: { x: '115%' },
  surfaceCenter: { x: 0, transition: { duration: 0.42, ease: EASE_IN_OUT, delay: 0.02 } },
  surfaceExit: { x: '115%', transition: { duration: 0.32, ease: EASE_OUT_FAST } },
};

/**
 * Docs left panel. On desktop it slides in from the left AFTER the app has
 * left (mode="wait" sequences it). On mobile the panel IS the hamburger drawer
 * (class-driven transform), so we must NOT set an inline transform there — we
 * fall back to opacity-only so the drawer keeps working.
 */
export function docsAsideVariants(isDesktop: boolean): Variants {
  if (!isDesktop) {
    return {
      surfaceEnter: { opacity: 0 },
      surfaceCenter: { opacity: 1 },
      surfaceExit: { opacity: 0 },
    };
  }
  return {
    surfaceEnter: { x: '-110%', opacity: 0 },
    surfaceCenter: { x: 0, opacity: 1, transition: { duration: 0.44, ease: EASE_IN_OUT, delay: 0.06 } },
    surfaceExit: { x: '-110%', opacity: 0, transition: { duration: 0.3, ease: EASE_OUT_FAST } },
  };
}

/** Docs reading column — a soft fade-up as the surface arrives. */
export const docsContentVariants: Variants = {
  surfaceEnter: { opacity: 0, y: 14 },
  surfaceCenter: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_IN_OUT, delay: 0.12 } },
  surfaceExit: { opacity: 0, transition: { duration: 0.2 } },
};

// --- desktop media-query hook (SSR-safe, shared subscription) --------------
const DESKTOP_QUERY = '(min-width: 1024px)'; // Tailwind `lg`
function subscribeDesktop(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function getDesktopSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** True when the viewport is at the Tailwind `lg` breakpoint or wider. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => true);
}
