/**
 * PaintFirstBrowserRouter
 * =======================
 * BrowserRouter, except a navigation paints before the next page renders.
 *
 * React Router's own BrowserRouter hands every navigation straight to React,
 * inside the click (or popstate) that caused it, so the whole next page —
 * hundreds of components, a full layout — renders before the browser can draw
 * anything. Measured on dehub.io that left the old page frozen 200-630 ms on a
 * laptop and around a second on a mid-range phone after every profile, post
 * and Back tap.
 *
 * Here the tap first puts the DeHub logo up (plain DOM, no React render, no
 * blur, so it costs one cheap frame), lets the browser paint it, and only then
 * renders the next page. The logo fades in on a short delay, and the fade runs
 * on the compositor, so a page that is ready quickly never flashes it and a
 * slow one shows it while the main thread is busy. It comes down as soon as
 * the new page has committed.
 *
 * A deferred render (useDeferredValue / startTransition) was tried first and
 * made things worse: the feed's constant updates (video progress, timers)
 * kept interrupting the background render, so the new page arrived seconds
 * late. This keeps the render synchronous and only moves it one frame.
 *
 * The history itself is a small copy of @remix-run/router's browser history
 * (same `{ usr, key, idx }` state shape), so routes, `useNavigate`,
 * `useNavigationType` and history.state readers behave exactly as before.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavigationType, Router, createPath, parsePath, type Location, type To } from 'react-router-dom';

type HistoryState = { usr?: unknown; key?: string; idx?: number } | null;
type Update = { action: NavigationType; location: Location };

const createKey = () => Math.random().toString(36).slice(2, 10);

function readLocation(): Location {
  const { pathname, search, hash } = window.location;
  const state = window.history.state as HistoryState;
  return {
    pathname,
    search,
    hash,
    state: state?.usr ?? null,
    key: state?.key || 'default',
  };
}

function toLocation(current: Location, to: To, state: unknown): Location {
  const parsed = typeof to === 'string' ? parsePath(to) : to;
  return {
    pathname: current.pathname,
    search: '',
    hash: '',
    ...parsed,
    state,
    key: createKey(),
  } as Location;
}

function createHref(to: To): string {
  return typeof to === 'string' ? to : createPath(to);
}

function encodeLocation(to: To) {
  const base = window.location.origin !== 'null' ? window.location.origin : window.location.href;
  const href = createHref(to).replace(/ $/, '%20');
  const url = new URL(href, base);
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}

const PENDING_ID = 'dehub-navigation-pending';

/** Plain DOM so showing it never waits on React. */
function showPending() {
  if (document.getElementById(PENDING_ID)) return;
  const wrap = document.createElement('div');
  wrap.id = PENDING_ID;
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-label', 'Loading');
  wrap.setAttribute('data-navigation-pending', '');
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;pointer-events:none;';
  const img = document.createElement('img');
  img.src = '/dehub-loader-240.webp';
  img.alt = '';
  img.width = 56;
  img.height = 56;
  img.setAttribute('aria-hidden', 'true');
  img.className = 'dehub-loader-mark select-none';
  img.style.cssText = 'width:56px;height:56px;flex:none;object-fit:contain;animation-delay:120ms;';
  wrap.appendChild(img);
  document.body.appendChild(wrap);
}

function hidePending() {
  document.getElementById(PENDING_ID)?.remove();
}

export function PaintFirstBrowserRouter({ children }: { children?: ReactNode }) {
  const [update, setUpdate] = useState<Update>(() => ({ action: NavigationType.Pop, location: readLocation() }));
  const listenerRef = useRef<(next: Update) => void>(() => {});
  const indexRef = useRef<number>(0);
  const renderedPathRef = useRef(update.location.pathname);
  renderedPathRef.current = update.location.pathname;

  // One frame for the logo to paint, then the render. A newer navigation in
  // that gap replaces the older one; only the latest renders.
  const pendingRef = useRef<{ frame: number; timer: number } | null>(null);
  listenerRef.current = (next) => {
    if (pendingRef.current) {
      cancelAnimationFrame(pendingRef.current.frame);
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
    // A replace (query params, language prefix, cleaning up a one-time param)
    // or a change within the same page is not a page change: apply it at once
    // as before, with no logo.
    if (next.action === NavigationType.Replace || next.location.pathname === renderedPathRef.current) {
      hidePending();
      setUpdate(next);
      return;
    }
    showPending();
    const slot = { frame: 0, timer: 0 };
    slot.frame = requestAnimationFrame(() => {
      slot.timer = window.setTimeout(() => {
        pendingRef.current = null;
        setUpdate(next);
      }, 0);
    });
    pendingRef.current = slot;
  };

  const navigator = useMemo(() => {
    const globalHistory = window.history;
    const currentIndex = () => (globalHistory.state as HistoryState)?.idx;
    if (currentIndex() == null) {
      globalHistory.replaceState({ ...(globalHistory.state as object), idx: 0 }, '');
    }
    indexRef.current = currentIndex() ?? 0;

    const historyState = (location: Location, idx: number) => ({ usr: location.state, key: location.key, idx });

    return {
      createHref,
      encodeLocation,
      go: (n: number) => globalHistory.go(n),
      push(to: To, state?: unknown) {
        const location = toLocation(readLocation(), to, state);
        const idx = (currentIndex() ?? indexRef.current) + 1;
        indexRef.current = idx;
        const url = createHref(location);
        try {
          globalHistory.pushState(historyState(location, idx), '', url);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'DataCloneError') throw error;
          window.location.assign(url);
          return;
        }
        listenerRef.current({ action: NavigationType.Push, location: readLocation() });
      },
      replace(to: To, state?: unknown) {
        const location = toLocation(readLocation(), to, state);
        const idx = currentIndex() ?? indexRef.current;
        indexRef.current = idx;
        globalHistory.replaceState(historyState(location, idx), '', createHref(location));
        listenerRef.current({ action: NavigationType.Replace, location: readLocation() });
      },
    };
  }, []);

  useLayoutEffect(() => {
    const onPop = () => {
      indexRef.current = (window.history.state as HistoryState)?.idx ?? indexRef.current;
      listenerRef.current({ action: NavigationType.Pop, location: readLocation() });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Down as soon as the new page has committed (before it paints), whether it
  // rendered or fell back to its own loading state.
  useLayoutEffect(() => {
    if (!pendingRef.current) hidePending();
  }, [update]);

  return (
    <Router location={update.location} navigationType={update.action} navigator={navigator}>
      {children}
    </Router>
  );
}
