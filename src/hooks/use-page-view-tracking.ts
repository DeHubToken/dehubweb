import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordPageView, setPageViewAddress } from '@/lib/page-view-tracker';

/**
 * Records a page view on every route change.
 *
 * Mounted directly under the router rather than inside AppContent, because two
 * routes never reach AppContent: the referral lander `/r/:code`, which is a new
 * visitor's very first touch of DeHub and so the single most interesting row in
 * the table, and the state gallery. Tracking from inside the subtree that
 * handles everything *else* silently excluded exactly the page worth counting.
 *
 * Renders nothing.
 */
export function usePageViewTracking(walletAddress?: string | null): void {
  const { pathname } = useLocation();

  useEffect(() => {
    setPageViewAddress(walletAddress ?? null);
  }, [walletAddress]);

  useEffect(() => {
    recordPageView(pathname);
  }, [pathname]);
}

/**
 * Component form, for mounting above <Routes> where there is no component of
 * our own to hang a hook on. The address is attached separately by AppContent,
 * which is where auth state lives — a view recorded before that lands is simply
 * an anonymous one, which is what it was.
 */
export function PageViewTracker(): null {
  usePageViewTracking();
  return null;
}

/**
 * Attribution only. AppContent owns auth state but is not where views are
 * recorded any more, so it supplies the address and nothing else — recording
 * from both places would rely on the tracker's repeat-path dedup to stay
 * correct, which is a subtle thing to make load-bearing.
 */
export function usePageViewAddress(walletAddress?: string | null): void {
  useEffect(() => {
    setPageViewAddress(walletAddress ?? null);
  }, [walletAddress]);
}
