import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordPageView, setPageViewAddress } from '@/lib/page-view-tracker';

/**
 * Records a page view on every route change. Mounted once, inside the router.
 *
 * The wallet address is attached when there is one so a route's traffic can be
 * split into signed-in and signed-out without joining anything — but it is
 * never what identifies the visit, which is why it is optional all the way
 * down to the column.
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
