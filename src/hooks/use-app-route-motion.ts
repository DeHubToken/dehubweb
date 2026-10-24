import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Location } from 'react-router-dom';
import { getSurface } from '@/lib/surface-motion';

interface RouteTransition {
  ready?: Promise<void>;
  finished: Promise<void>;
  skipTransition(): void;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => RouteTransition;
};

function historyIndex(): number {
  return typeof history.state?.idx === 'number' ? history.state.idx : 0;
}

/** Snapshot the viewport rather than transforming live glass/scroll layers. */
export function useAppRouteMotion(location: Location, reducedMotion: boolean | null): Location {
  const [displayed, setDisplayed] = useState(location);
  const previousIndex = useRef(historyIndex());
  const transition = useRef<RouteTransition | null>(null);
  const generation = useRef(0);
  const appNavigation = getSurface(displayed.pathname) === 'app' && getSurface(location.pathname) === 'app';

  useLayoutEffect(() => {
    const index = historyIndex();
    const backwards = index < previousIndex.current;
    previousIndex.current = index;
    if (displayed.key === location.key) return;

    const token = ++generation.current;
    transition.current?.skipTransition();
    const root = document.documentElement;
    const doc = document as TransitionDocument;
    const sameProfile = !/^\/(app\/)?profile\/?$/.test(location.pathname) ||
      new URLSearchParams(displayed.search).get('id') === new URLSearchParams(location.search).get('id');
    const commit = () => {
      if (generation.current === token) setDisplayed(location);
    };
    if (
      !appNavigation || (displayed.pathname === location.pathname && sameProfile) || reducedMotion ||
      root.classList.contains('reduce-motion') || !doc.startViewTransition ||
      !document.querySelector('[data-main-panel]')
    ) {
      commit();
      return;
    }

    root.dataset.appNavigation = backwards ? 'back' : 'forward';
    try {
      const current = doc.startViewTransition(() => flushSync(commit));
      transition.current = current;
      void current.ready?.catch(() => {});
      void current.finished.catch(() => {}).finally(() => {
        if (transition.current !== current) return;
        transition.current = null;
        delete root.dataset.appNavigation;
      });
    } catch {
      delete root.dataset.appNavigation;
      commit();
    }
  }, [location, displayed, appNavigation, reducedMotion]);

  useLayoutEffect(() => () => {
    generation.current++;
    transition.current?.skipTransition();
    delete document.documentElement.dataset.appNavigation;
  }, []);

  return appNavigation ? displayed : location;
}
