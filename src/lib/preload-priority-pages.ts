const PRELOAD_KEY = 'priority-pages-preloaded';

/**
 * `timeout` matters more than it looks. These preloads are scheduled while the
 * feed is still settling, and a main thread that never goes idle simply never
 * runs a plain requestIdleCallback — the exact case the preloading exists for.
 * The timeout turns "when there is a gap" into "in the next gap, or 2s from
 * now, whichever comes first".
 */
const idle = (cb: () => void) => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 50);
  }
};

const preload = (importFn: () => Promise<any>) => importFn().catch(() => {});

export function preloadPriorityPages(): void {
  if (sessionStorage.getItem(PRELOAD_KEY)) return;
  sessionStorage.setItem(PRELOAD_KEY, 'true');

  // Batch 0 — as soon as the browser has a gap.
  //
  // Profile and Messages are the two sidebar destinations people open first,
  // and they are also the two whose skeletons are the most misleading: a
  // profile with no avatar, no username and no posts reads as a broken
  // account, not as a page that is still loading, so somebody who opens one
  // before its chunk has downloaded reloads the tab rather than waiting. They
  // used to sit at 3s and 6s respectively — comfortably longer than it takes
  // to land on the feed and click, which is how a plain lazy-load delay
  // reached us as a profile bug report.
  idle(() => {
    preload(() => import('@/pages/app/ProfilePage'));
    preload(() => import('@/pages/app/MessagesPage'));
  });

  // Batch 1 — 3s after mount
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/ExplorePage'));
      preload(() => import('@/pages/app/NotificationsPage'));
    });
  }, 3000);

  // Batch 2 — 6s after mount
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/SettingsPage'));
      preload(() => import('@/pages/app/FullWalletPage'));
    });
  }, 6000);

  // Batch 3 — 10s after mount: common bottom-nav scroll destinations, so
  // taps on them are warm even without hover/touch intent preloading.
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/StakingPage'));
      preload(() => import('@/pages/app/CommunitiesPage'));
      preload(() => import('@/pages/app/EventsPage'));
      preload(() => import('@/pages/app/LeaderboardPage'));
    });
  }, 10000);
}
