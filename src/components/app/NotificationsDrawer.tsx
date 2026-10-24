import { useTranslation as _useCopy } from 'react-i18next';
import { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import X from "@/components/ui/cut-icons/close";

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
      <DrawerContent className="!mt-0 !h-[100dvh] !max-h-[100dvh] !rounded-none !border-0 !shadow-none flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <DrawerTitle className="sr-only">{_copy("copy.788011833a5a", { defaultValue: "Notifications" })}</DrawerTitle>
        <DrawerDescription className="sr-only">{_copy("copy.efe4bbcc61b3", { defaultValue: "Your notifications" })}</DrawerDescription>
        <div className="flex shrink-0 justify-end px-3">
          <button onClick={() => setOpen(false)} aria-label={_copy("copy.25c57a564163", { defaultValue: "Close notifications" })} data-notifications-close className="flex h-11 w-11 items-center justify-center text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
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
