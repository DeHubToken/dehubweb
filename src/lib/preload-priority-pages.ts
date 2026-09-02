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

/**
 * Whether this browser has ever held a DeHub session. The key is written by
 * AuthProvider on the first successful login and survives it, so it is a
 * cheap synchronous stand-in for "this person can reach the signed-in pages"
 * — good enough to decide what is worth warming, without waiting on the auth
 * context to settle.
 */
const hasSession = (): boolean => {
  try {
    return !!localStorage.getItem('dehub_wallet');
  } catch {
    return false;
  }
};

export function preloadPriorityPages(): void {
  if (sessionStorage.getItem(PRELOAD_KEY)) return;
  sessionStorage.setItem(PRELOAD_KEY, 'true');

  // Signed-out visitors cannot open Profile, Messages, Notifications, Settings
  // or the wallet, so warming those chunks for them is pure download: on the
  // 2026-09-02 Lighthouse run of the signed-out home, SettingsPage and friends
  // were 874 KB of the "unused JavaScript" total for a page that can never
  // route to them. Everyone still gets the public destinations below.
  const signedIn = hasSession();

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
  if (signedIn) {
    idle(() => {
      preload(() => import('@/pages/app/ProfilePage'));
      preload(() => import('@/pages/app/MessagesPage'));
    });
  }

  // Batch 1 — 3s after mount
  setTimeout(() => {
    idle(() => {
      preload(() => import('@/pages/app/ExplorePage'));
      if (signedIn) preload(() => import('@/pages/app/NotificationsPage'));
    });
  }, 3000);

  // Batch 2 — 6s after mount
  if (signedIn) {
    setTimeout(() => {
      idle(() => {
        preload(() => import('@/pages/app/SettingsPage'));
        preload(() => import('@/pages/app/FullWalletPage'));
      });
    }, 6000);
  }

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
