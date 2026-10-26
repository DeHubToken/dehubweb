import { useTranslation as _useCopy } from 'react-i18next';
import { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazy-with-retry';

// Same loader as the /app/notifications route. A plain lazy() remembers a
// failed chunk, and with no boundary of its own the throw replaced the whole
// app with the dark full-page fallback that a reload could not clear.
const NotificationsPage = lazyWithRetry(() => import('@/pages/app/NotificationsPage'));
export const openNotificationsDrawer = () => window.dispatchEvent(new Event('open-notifications-drawer'));

export function NotificationsDrawer() {
  const { t: _copy } = _useCopy();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('open-notifications-drawer', show);
    return () => window.removeEventListener('open-notifications-drawer', show);
  }, []);
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {/* Phone only (the bell routes to the page on desktop). A plain glass
          sheet: the handle is the only chrome, and dragging it, or pulling down
          from the top of the list, closes it. No close button, nothing above
          the notifications' own header. */}
      <DrawerContent glass hideHandle={false} data-notifications-drawer className="!mt-0 h-[calc(100dvh_-_env(safe-area-inset-top,0px)_-_10px)] !border-x-0 !border-b-0 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <DrawerTitle className="sr-only">{_copy("copy.788011833a5a", { defaultValue: "Notifications" })}</DrawerTitle>
        <DrawerDescription className="sr-only">{_copy("copy.efe4bbcc61b3", { defaultValue: "Your notifications" })}</DrawerDescription>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
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
