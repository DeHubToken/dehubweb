import React from 'react';

/**
 * Timestamp of the last reload we triggered for a chunk failure. Deliberately
 * a TIMESTAMP and not a boolean: the old boolean flag was cleared on every boot
 * from main.tsx, which meant it could never see the reload it had just caused.
 * Landing on a route whose chunk was dead looped forever — fail, set flag,
 * reload, flag cleared, fail — and changing the URL by hand was the only way
 * out. A timestamp survives the reload and still expires, so a genuinely new
 * stale deploy later in the same session still gets its one automatic reload.
 */
const CHUNK_RELOAD_AT_KEY = 'chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * True if a chunk-failure reload is allowed right now; records the attempt as a
 * side effect. Returns false inside the cooldown, which is the signal that a
 * reload has already been tried and did not help — the caller should surface
 * the error instead of reloading again.
 */
export function shouldReloadForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_AT_KEY)) || 0;
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now()));
    return true;
  } catch {
    // Private-mode / storage-disabled: never auto-reload rather than risk a loop.
    return false;
  }
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
 * 3. If the retry fails, reloads once to get fresh HTML with live chunk URLs
 * 4. Inside the reload cooldown, rejects so the ErrorBoundary can show up
 *
 * The retry in step 2 only earns its keep when the failure was a genuine
 * network blip. A stale-deploy miss is served from cache (the edge answers a
 * dead chunk with `immutable, max-age=31536000`), so the retry re-reads the
 * same bad response and step 3 is what actually recovers.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    importFn().catch(() => {
      // Retry once after 1 second
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          importFn()
            .then(resolve)
            .catch((retryError: unknown) => {
              if (shouldReloadForChunkError()) {
                window.location.reload();
                // Never resolve, so no error flashes before the reload lands.
                return;
              }
              // A reload was already tried and we are back here anyway — let it
              // through to the ErrorBoundary rather than reloading in a loop.
              reject(retryError);
            });
        }, 1000);
      });
    })
  );
}
