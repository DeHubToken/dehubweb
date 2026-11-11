import React from 'react';

/**
 * When this tab last tried to recover from a chunk failure, and how many
 * attempts it has spent. Deliberately a TIMESTAMP and not a boolean: the old
 * boolean flag was cleared on every boot from main.tsx, which meant it could
 * never see the reload it had just caused. Landing on a route whose chunk was
 * dead looped forever — fail, set flag, reload, flag cleared, fail — and
 * changing the URL by hand was the only way out. A timestamp survives the
 * reload and still expires, so a genuinely new stale deploy later in the same
 * session starts again from the first tier.
 */
const CHUNK_RECOVERY_AT_KEY = 'chunk-reload-at';
const CHUNK_RECOVERY_TIER_KEY = 'chunk-reload-tier';
/** Two failures further apart than this are separate incidents, not a loop. */
const RECOVERY_WINDOW_MS = 120_000;
/** A reload takes a moment to land; ignore anything caught while it is in flight. */
const RELOAD_SETTLE_MS = 5_000;
/**
 * How long a failure waits before it is allowed to reload the page.
 *
 * Safari cancels every unfinished script download the moment the page starts
 * navigating — tapping Google or Apple sign-in, a link to another site, a
 * reload — and each cancelled `import()` rejects with the very same "Importing
 * a module script failed" a deleted chunk produces. Reloading on the spot
 * replaced the Google sign-in page with riftn.com again, so sign-in on iPhone
 * bounced straight back, and every bounce spent a recovery attempt until the
 * crash screen was all that was left. Waiting a beat lets a page that is
 * leaving finish leaving; the timer simply never fires.
 */
const RECOVERY_DELAY_MS = 1_500;
/** A navigation that has not replaced the page after this long was cancelled. */
const LEAVE_GRACE_MS = 4_000;

// Only this document can have a navigation in flight. A persisted timestamp
// belongs to the retry budget, not to the new document's navigation state.
let reloadStartedAt: number | null = null;
/** A recovery reload is queued (waiting out RECOVERY_DELAY_MS or a hidden tab). */
let recoveryQueued = false;
/** When this page last started navigating away. 0 = it is not leaving. */
let leavingAt = 0;

function markLeaving(): void {
  leavingAt = Date.now();
}

/**
 * True while this page is on its way out: unloading, or navigating to another
 * site (OAuth sign-in) or reloading. Chunk failures in that window are the
 * browser cancelling downloads, not missing files.
 */
export function isPageLeaving(): boolean {
  return leavingAt > 0 && Date.now() - leavingAt < LEAVE_GRACE_MS;
}

function watchPageLeaving(): void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('beforeunload', markLeaving);
  window.addEventListener('pagehide', markLeaving);
  // Back from the back/forward cache: the page did not leave after all.
  window.addEventListener('pageshow', () => { leavingAt = 0; });
  // iPhone Safari never fires beforeunload, so the Navigation API (Safari 26+,
  // Chrome) is what sees `location.assign(googleUrl)` before the downloads are
  // cancelled. Only document-replacing navigations count: another origin, or a
  // reload. In-app route changes stay same-document and must not.
  try {
    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    nav?.addEventListener?.('navigate', (event: Event) => {
      const e = event as Event & { navigationType?: string; destination?: { url?: string } };
      if (e.navigationType === 'reload') { markLeaving(); return; }
      const url = e.destination?.url;
      if (!url) return;
      try {
        if (new URL(url).origin !== window.location.origin) markLeaving();
      } catch {
        // Unparseable destination — leave the flag alone.
      }
    });
  } catch {
    // No Navigation API — the delay below still covers a page that leaves.
  }
}
watchPageLeaving();

export type ChunkRecovery = 'reloading' | 'exhausted';

/**
 * Drop everything this origin has cached, so the reload that follows cannot be
 * handed the same dead chunk again. The service worker is unregistered as well
 * — a worker from an older build can keep answering /assets/ out of its own
 * cache long after the deploy that orphaned those files.
 *
 * Best-effort by design: every step is optional and none of it may hold the
 * reload up for long, so the whole thing races a short timer.
 */
function purgeCaches(): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  try {
    if ('caches' in window) {
      jobs.push(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
    }
  } catch {
    // Storage disabled — nothing to purge.
  }
  try {
    if ('serviceWorker' in navigator) {
      jobs.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister()))),
      );
    }
  } catch {
    // Unsupported or blocked — the reload below is still worth doing.
  }
  return Promise.race([
    Promise.all(jobs).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]).catch(() => undefined);
}

function readTier(): { last: number; tier: number } | null {
  try {
    return {
      last: Number(sessionStorage.getItem(CHUNK_RECOVERY_AT_KEY)) || 0,
      tier: Number(sessionStorage.getItem(CHUNK_RECOVERY_TIER_KEY)) || 0,
    };
  } catch {
    return null;
  }
}

/** The tier the next reload would be, or 0 when the budget is spent. */
function nextTier(): number {
  const state = readTier();
  // Private-mode / storage-disabled: never auto-reload rather than risk a loop.
  if (!state) return 0;
  // Long enough since the last one that this counts as a new incident.
  const tier = Date.now() - state.last > RECOVERY_WINDOW_MS ? 0 : state.tier;
  return tier + 1 > 2 ? 0 : tier + 1;
}

function isHidden(): boolean {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

/**
 * The queued recovery, run once the failure has had time to turn out to be a
 * page that was leaving anyway. The attempt is only charged to the retry
 * budget here, when a reload really happens — a cancelled download that never
 * led anywhere no longer uses up an attempt.
 */
function runQueuedRecovery(): void {
  if (isPageLeaving()) {
    recoveryQueued = false;
    return;
  }
  // A phone tab in the background (switched to Mail for the sign-in code)
  // loses its downloads too. Reload when the person is back, not behind them.
  if (isHidden()) {
    const onVisible = () => {
      if (isHidden()) return;
      document.removeEventListener('visibilitychange', onVisible);
      setTimeout(runQueuedRecovery, RECOVERY_DELAY_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    return;
  }
  const tier = nextTier();
  recoveryQueued = false;
  if (!tier) return;
  try {
    sessionStorage.setItem(CHUNK_RECOVERY_AT_KEY, String(Date.now()));
    sessionStorage.setItem(CHUNK_RECOVERY_TIER_KEY, String(tier));
  } catch {
    return;
  }
  reloadStartedAt = Date.now();
  const reload = () => {
    try { window.location.reload(); } catch { /* Keep the recovery UI available. */ }
  };
  if (tier === 1) reload();
  else void purgeCaches().then(reload);
}

/**
 * Get the user back to a working page instead of showing them a crash screen.
 * Escalates, because the cheap fix does not always take:
 *
 *   1st failure — plain reload. Fresh index.html carries live chunk URLs, which
 *     is all a routine stale-deploy miss needs.
 *   2nd failure — the reload did not help, so something is still handing out the
 *     dead chunk. Purge Cache Storage, unregister the service worker, reload
 *     again.
 *   3rd failure — out of ideas. Return 'exhausted' so the caller can surface the
 *     error rather than reloading forever.
 *
 * The reload itself waits RECOVERY_DELAY_MS (and for a hidden tab to come
 * back), and is dropped if the page navigates away meanwhile — see
 * RECOVERY_DELAY_MS for why reloading on the spot broke sign-in on iPhone.
 *
 * A 'reloading' result means navigation was requested (or is about to be).
 * Callers must still settle their promises and keep a fallback visible if
 * navigation is blocked.
 */
export function recoverFromChunkError(): ChunkRecovery {
  if (reloadStartedAt !== null) {
    return Date.now() - reloadStartedAt < RELOAD_SETTLE_MS ? 'reloading' : 'exhausted';
  }
  // The page is navigating away: the failure is the browser cancelling the
  // download, and whatever page comes next starts from fresh code anyway.
  if (isPageLeaving()) return 'reloading';
  if (recoveryQueued) return 'reloading';
  if (!nextTier()) return 'exhausted';
  recoveryQueued = true;
  setTimeout(runQueuedRecovery, RECOVERY_DELAY_MS);
  return 'reloading';
}

/**
 * Every phrasing browsers use for "the module didn't load", including the one
 * that matters most here: a chunk that no longer exists is answered by the SPA
 * catch-all with index.html at 200, so it fails the module MIME check rather
 * than the network. Each engine words all of this differently, and matching
 * only Chrome's meant Firefox users got a dead error screen with no reload.
 */
const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome, Edge
  'error loading dynamically imported module',   // Firefox
  'importing a module script failed',            // Safari
  'expected a javascript module script',         // MIME rejection (HTML shell)
  'unable to preload css',                       // Vite's CSS preload helper
  'loading chunk',
  'loading css chunk',
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: string; message?: string };
  if (err.name === 'ChunkLoadError') return true;
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Wraps React.lazy() with retry + auto-reload on chunk load failure.
 *
 * 1. Tries the import
 * 2. On failure, waits 1s and retries once
 * 3. If the retry fails, reloads for fresh HTML with live chunk URLs — and if
 *    that reload did not help, purges the caches and service worker and
 *    reloads again
 * 4. Reject so the ErrorBoundary remains usable if navigation never completes.
 *
 * The retry in step 2 only earns its keep when the failure was a genuine
 * network blip. A stale-deploy miss is served from cache (the edge answers a
 * dead chunk with `immutable, max-age=31536000`), so the retry re-reads the
 * same bad response and step 3 is what actually recovers.
 */
export type PreloadableLazy<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
  /**
   * Start (or join) the chunk load without rendering. Resolves with the
   * module; once it has resolved, rendering the component never suspends.
   */
  preload: () => Promise<{ default: T }>;
};

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): PreloadableLazy<T> {
  let loaded: { default: T } | null = null;
  let inflight: Promise<{ default: T }> | null = null;

  const load = (): Promise<{ default: T }> => {
    if (loaded) return Promise.resolve(loaded);
    if (inflight) return inflight;
    inflight = importFn()
      .catch(() => {
        // Retry once after 1 second
        return new Promise<{ default: T }>((resolve, reject) => {
          setTimeout(() => {
            importFn()
              .then(resolve)
              .catch((retryError: unknown) => {
                if (isChunkLoadError(retryError)) recoverFromChunkError();
                reject(retryError);
              });
          }, 1000);
        });
      })
      .then((mod) => {
        loaded = mod;
        return mod;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
    return inflight;
  };

  // React.lazy calls the factory on first render and suspends until the
  // thenable it gets back settles — and a real Promise settles in a microtask
  // even when it is already resolved, so a chunk that finished loading before
  // React ever rendered still costs one suspended render and one fallback
  // commit. On the very first commit that fallback REPLACES whatever the HTML
  // shell was showing (the prerendered welcome panel), which reads as a flash.
  // Once the module is in hand, hand React a thenable that calls back
  // synchronously: lazy's initializer sees "resolved" before it decides
  // whether to throw, and the component renders like a plain import.
  const component = React.lazy(() => {
    if (loaded) {
      const mod = loaded;
      const settled = {
        then(onFulfilled?: (value: { default: T }) => unknown) {
          onFulfilled?.(mod);
          return settled;
        },
      };
      return settled as unknown as Promise<{ default: T }>;
    }
    return load();
  }) as PreloadableLazy<T>;
  component.preload = load;
  return component;
}
