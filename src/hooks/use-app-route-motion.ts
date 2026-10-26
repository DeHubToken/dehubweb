import { startTransition, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Location } from 'react-router-dom';
import { getSurface } from '@/lib/surface-motion';
import { getRetainedPost, retainedPostId } from '@/lib/retained-post-surface';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { ROUTE_CONTENT_READY, showRouteLoadingShell, type RouteLoadingShell } from '@/lib/route-loading-shell';

/**
 * Only opening a post gets the loading cover: its page announces readiness and
 * its body is heavy. Tabs, profiles and every other page switch commit straight
 * away and show their own skeleton, so a tab tap never flashes a cover first.
 */
const COVERED_ROUTE = /^\/(?:app\/)?(?:post|posts|video|newpost)\//;
export function usesLoadingCover(pathname: string): boolean {
  return COVERED_ROUTE.test(pathname);
}

function historyIndex(): number {
  return typeof history.state?.idx === 'number' ? history.state.idx : 0;
}

/** Paint the destination shell before scheduling its potentially heavy content. */
export function useAppRouteMotion(location: Location, reducedMotion: boolean | null): Location {
  const { t } = useTranslation();
  const [displayed, setDisplayed] = useState(location);
  const previousIndex = useRef(historyIndex());
  const shell = useRef<RouteLoadingShell | null>(null);
  const generation = useRef(0);
  const destinationKey = useRef(location.key);
  destinationKey.current = location.key;
  const readyKey = useRef<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const appNavigation = getSurface(displayed.pathname) === 'app' && getSurface(location.pathname) === 'app';

  useLayoutEffect(() => {
    const index = historyIndex();
    const backwards = index < previousIndex.current;
    previousIndex.current = index;
    if (displayed.key === location.key) {
      const cancelled = pendingKey.current !== null && pendingKey.current !== location.key;
      pendingKey.current = null;
      generation.current++;
      if (cancelled) setDisplayed(location);
      if (cancelled || !usesLoadingCover(location.pathname) || readyKey.current === location.key) shell.current?.reveal();
      return;
    }

    const token = ++generation.current;
    pendingKey.current = location.key;
    shell.current?.remove();
    shell.current = null;
    const commit = () => {
      setDisplayed(previous => generation.current === token ? location : previous);
    };
    // This trip moves an already-mounted card. A painted loading cover would
    // hide the very content the reader just selected, including on Back.
    const retainedTrip = (isHomeFeedRoute(displayed.pathname) && getRetainedPost(retainedPostId(location.pathname)))
      || (isHomeFeedRoute(location.pathname) && getRetainedPost(retainedPostId(displayed.pathname)));
    if (retainedTrip) {
      commit();
      return;
    }
    if (!appNavigation || !usesLoadingCover(location.pathname) || displayed.pathname === location.pathname) {
      commit();
      return;
    }

    shell.current = showRouteLoadingShell(t('sidebar.post', { defaultValue: 'Post' }), t('common.back', { defaultValue: 'Back' }), backwards);
    if (!shell.current) {
      commit();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    // rAF runs before paint. Its following task lets that frame reach screen
    // before React starts work; a transition then keeps input interruptible.
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (generation.current !== token) return;
        shell.current?.cover();
        startTransition(commit);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [location, displayed, appNavigation, reducedMotion, t]);

  useLayoutEffect(() => {
    const ready = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key !== destinationKey.current) return;
      readyKey.current = key;
      shell.current?.reveal();
    };
    window.addEventListener(ROUTE_CONTENT_READY, ready);
    return () => {
      generation.current++;
      shell.current?.remove();
      window.removeEventListener(ROUTE_CONTENT_READY, ready);
    };
  }, []);

  return appNavigation ? displayed : location;
}
