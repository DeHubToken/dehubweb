import { useSyncExternalStore } from 'react';

const TOP_THRESHOLD = 60;

/**
 * Module-level store: three components (HomePage, GlobalFeedNav,
 * MobileBottomNav) consume this hook, and the per-hook implementation attached
 * 7 listeners EACH (5 scroll targets + 2 touch) all computing the same
 * boolean. One shared listener set now feeds every subscriber via
 * useSyncExternalStore. Listeners attach on first subscribe and detach when
 * the last subscriber leaves.
 */
/**
 * Elements that scroll instead of the document opt in with this attribute.
 * The post layer (`[data-post-overlay]` in AppLayout) is one: it is `fixed` and
 * carries its own `overflow-y-auto`, so the document never moves while a post
 * opened from the feed is scrolled, and none of the targets below ever fire.
 * That is why the top bar used to stay pinned on post pages.
 *
 * Scroll events do not bubble, but they DO reach a capture listener on
 * document, so one listener covers a scroller that mounts and unmounts with a
 * route. Only tagged elements count — every dialog, chat panel and carousel on
 * the page also scrolls, and none of those should move the chrome.
 */
export const SCROLL_NAV_SOURCE_ATTR = 'data-scroll-nav-source';
const SCROLL_NAV_SOURCE_SELECTOR = `[${SCROLL_NAV_SOURCE_ATTR}]`;

let visible = true;
let lastScrollY = 0;
let touchLastY = 0;
/** The tagged element currently being scrolled, if any; null = the document. */
let activeScroller: HTMLElement | null = null;
const subscribers = new Set<() => void>();
let detach: (() => void) | null = null;

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  subscribers.forEach((cb) => cb());
}

function attachListeners(): () => void {
  const getY = () =>
    activeScroller?.isConnected
      ? activeScroller.scrollTop
      : window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

  activeScroller = null;
  lastScrollY = getY();
  // Re-seed visibility from the actual scroll position: if the last subscriber
  // left while the nav was hidden, a fresh subscriber at the top of a new page
  // must start visible (the old per-hook useState(true) gave this for free).
  setVisible(lastScrollY <= TOP_THRESHOLD ? true : visible);

  // ── scroll events: attach to every possible container ──────────────────
  const onScroll = () => {
    const y = getY();
    const diff = y - lastScrollY;
    lastScrollY = y;
    if (y <= TOP_THRESHOLD) { setVisible(true); return; }
    if (diff > 4)  setVisible(false);
    if (diff < -4) setVisible(true);
  };

  // Capture-phase catch-all for tagged element scrollers. Switching scroller
  // re-seeds the baseline and skips one frame rather than diffing this
  // container's scrollTop against the last one's — a jump of a few thousand
  // pixels would otherwise read as a hard scroll down.
  const onCapturedScroll = (e: Event) => {
    const target = e.target;
    const el =
      target instanceof HTMLElement && target.matches(SCROLL_NAV_SOURCE_SELECTOR)
        ? target
        : null;
    if (el !== activeScroller) {
      activeScroller = el;
      lastScrollY = getY();
      return;
    }
    if (el) onScroll();
  };

  // ── touch events: most reliable on iOS/Android ──────────────────────────
  const onTouchStart = (e: TouchEvent) => {
    touchLastY = e.touches[0].clientY;
    lastScrollY = getY();
  };

  const onTouchMove = (e: TouchEvent) => {
    const y = getY();
    // Keep the scroll baseline fresh while the finger is down. iOS defers
    // `scroll` events during an active drag, so without this the first
    // post-momentum `scroll` diffs against a stale, pre-gesture position and
    // can (wrongly) re-hide the nav on the way back up.
    lastScrollY = y;
    const currentY = e.touches[0].clientY;
    // Delta since the LAST move, not the gesture start — so reversing
    // direction mid-drag flips show/hide immediately. Measuring from the
    // start left `moved` positive after a downward flick, so scrolling back
    // up within the same touch never re-showed the nav (the stuck bug).
    const moved = touchLastY - currentY;
    touchLastY = currentY;
    if (y <= TOP_THRESHOLD) { setVisible(true); return; }
    if (moved > 6)  setVisible(false);  // finger up   → scrolling down → hide
    if (moved < -6) setVisible(true);   // finger down → scrolling up   → show
  };

  // Attach scroll to all candidates — no matter which one is the real container
  const targets: EventTarget[] = [
    window,
    document,
    document.documentElement,
    document.body,
  ];
  // Also attach to the app root div (overflow-x-clip may make it the scroll container)
  const appRoot = document.getElementById('app-root');
  if (appRoot) targets.push(appRoot);
  targets.forEach(t => t.addEventListener('scroll', onScroll, { passive: true }));
  document.addEventListener('scroll', onCapturedScroll, { passive: true, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove',  onTouchMove,  { passive: true });

  return () => {
    targets.forEach(t => t.removeEventListener('scroll', onScroll));
    document.removeEventListener('scroll', onCapturedScroll, { capture: true });
    activeScroller = null;
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove',  onTouchMove);
  };
}

function subscribe(cb: () => void): () => void {
  if (subscribers.size === 0 && !detach) detach = attachListeners();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

const getSnapshot = () => visible;
const getServerSnapshot = () => true;

export function useScrollDirection() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
