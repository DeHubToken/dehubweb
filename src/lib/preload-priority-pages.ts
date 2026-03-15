const PRELOAD_KEY = 'priority-pages-preloaded';

const idle = (cb: () => void) => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(cb);
  } else {
    setTimeout(cb, 50);
  }
};

const preload = (importFn: () => Promise<any>) => importFn().catch(() => {});

export function preloadPriorityPages(): void {
  if (sessionStorage.getItem(PRELOAD_KEY)) return;
  sessionStorage.setItem(PRELOAD_KEY, 'true');

  // Batch 1 — 3s after mount
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/ExplorePage'));
      preload(() => import('@/pages/app/ProfilePage'));
      preload(() => import('@/pages/app/NotificationsPage'));
    });
  }, 3000);

  // Batch 2 — 6s after mount
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/MessagesPage'));
      preload(() => import('@/pages/app/SettingsPage'));
      preload(() => import('@/pages/app/FullWalletPage'));
    });
  }, 6000);
}
