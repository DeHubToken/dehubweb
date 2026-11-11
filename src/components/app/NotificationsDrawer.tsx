import { useTranslation as _useCopy } from 'react-i18next';
import { Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazy-with-retry';
import { preloadRoute } from '@/lib/route-preload';
import { AuthContext } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchNotificationsList } from '@/hooks/use-notifications';
import { useDrawerPullClose } from '@/hooks/use-drawer-pull-close';

// Same loader as the /app/notifications route. A plain lazy() remembers a
// failed chunk, and with no boundary of its own the throw replaced the whole
// app with the dark full-page fallback that a reload could not clear.
const NotificationsPage = lazyWithRetry(() => import('@/pages/app/NotificationsPage'));
export const openNotificationsDrawer = () => window.dispatchEvent(new Event('open-notifications-drawer'));
/** Start the notifications chunk on a press, before the click opens the drawer. */
export const warmNotificationsDrawer = () => preloadRoute('/app/notifications');

/**
 * Signed in, the page's chunk is fetched once the app has settled, so the
 * first bell tap (drawer on phones, page on desktop) does not wait on a
 * download, and the first page of rows is warmed so it opens current. Same
 * import as the route, so it is one cached file either way.
 */
function useWarmNotificationsChunk() {
  const isAuthenticated = useContext(AuthContext)?.isAuthenticated ?? false;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isAuthenticated) return;
    const warm = () => {
      warmNotificationsDrawer();
      void prefetchNotificationsList(queryClient).catch(() => {});
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(warm, { timeout: 4000 });
      else warm();
    }, 6000);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
    };
  }, [isAuthenticated, queryClient]);
}

export function NotificationsDrawer() {
  const { t: _copy } = _useCopy();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useWarmNotificationsChunk();
  const auth = useContext(AuthContext);
  const authRef = useRef(auth);
  authRef.current = auth;
  useEffect(() => {
    // Signed out, the bell asks them to sign in over the page they are on, and
    // the sheet comes up once they have.
    const show = () => {
      const a = authRef.current;
      if (a && !a.isAuthenticated && !a.isLoading) {
        a.openLoginModal({ then: openNotificationsDrawer });
        return;
      }
      setOpen(true);
    };
    window.addEventListener('open-notifications-drawer', show);
    return () => window.removeEventListener('open-notifications-drawer', show);
  }, []);
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDrawerPullClose(sheetRef, scrollRef, open, close);
  return (
    <Drawer open={open} onOpenChange={setOpen} handleOnly animatedExit>
      {/* Phone only (the bell routes to the page on desktop). A glass sheet
          four fifths of the screen tall, so the page above shows it is a
          drawer, with no handle and no close button: pulling down anywhere on
          it closes it once the list is at the top (useDrawerPullClose), and
          rows scrolling up under the header blur out behind it (index.css). */}
      <DrawerContent ref={sheetRef} glass overlayClassName="backdrop-blur-[24px] backdrop-saturate-[1.6]" data-notifications-drawer className="!mt-0 h-[80dvh] max-h-[80dvh] !border-x-0 !border-b-0 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <DrawerTitle className="sr-only">{_copy("copy.788011833a5a", { defaultValue: "Notifications" })}</DrawerTitle>
        <DrawerDescription className="sr-only">{_copy("copy.efe4bbcc61b3", { defaultValue: "Your notifications" })}</DrawerDescription>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <ErrorBoundary compact resetKey={String(open)} label={_copy("copy.788011833a5a", { defaultValue: "Notifications" })}>
            <Suspense fallback={<div role="status" className="p-4">{_copy("copy.eae12e0d3bab", { defaultValue: "Loading notifications…" })}</div>}>
              {open && <NotificationsPage inDrawer />}
            </Suspense>
          </ErrorBoundary>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
