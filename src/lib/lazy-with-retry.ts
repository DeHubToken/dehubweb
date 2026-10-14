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
// Only this document can have a navigation in flight. A persisted timestamp
// belongs to the retry budget, not to the new document's navigation state.
let reloadStartedAt: number | null = null;

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
 * A 'reloading' result means navigation was requested. Callers must still
 * settle their promises and keep a fallback visible if navigation is blocked.
 */
export function recoverFromChunkError(): ChunkRecovery {
  if (reloadStartedAt !== null) {
    return Date.now() - reloadStartedAt < RELOAD_SETTLE_MS ? 'reloading' : 'exhausted';
  }
  let last = 0;
  let tier = 0;
  try {
    last = Number(sessionStorage.getItem(CHUNK_RECOVERY_AT_KEY)) || 0;
    tier = Number(sessionStorage.getItem(CHUNK_RECOVERY_TIER_KEY)) || 0;
  } catch {
    // Private-mode / storage-disabled: never auto-reload rather than risk a loop.
    return 'exhausted';
  }

  const since = Date.now() - last;
  // Long enough since the last one that this counts as a new incident.
  if (since > RECOVERY_WINDOW_MS) tier = 0;

  const nextTier = tier + 1;
  if (nextTier > 2) return 'exhausted';

  try {
    sessionStorage.setItem(CHUNK_RECOVERY_AT_KEY, String(Date.now()));
    sessionStorage.setItem(CHUNK_RECOVERY_TIER_KEY, String(nextTier));
  } catch {
    return 'exhausted';
  }

  reloadStartedAt = Date.now();
  const reload = () => {
    try { window.location.reload(); } catch { /* Keep the recovery UI available. */ }
  };
  if (nextTier === 1) reload();
  else void purgeCaches().then(reload);
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
