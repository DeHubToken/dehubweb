import React from 'react';

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

/**
 * Wraps React.lazy() with retry + auto-reload on chunk load failure.
 * 
 * 1. Tries the import
 * 2. On failure, waits 1s and retries once
 * 3. If retry fails, reloads the page once (to get fresh HTML with new chunk URLs)
 * 4. Uses sessionStorage flag to prevent infinite reload loops
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    importFn().catch((error: unknown) => {
      // Retry once after 1 second
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          importFn()
            .then(resolve)
            .catch((retryError: unknown) => {
              // Check if we already tried reloading
              const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);

              if (!alreadyReloaded) {
                sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');
                window.location.reload();
                // Return a never-resolving promise to prevent error flash before reload
                return new Promise<never>(() => {});
              }

              // Already reloaded once — clear flag and let ErrorBoundary handle it
              sessionStorage.removeItem(CHUNK_RELOAD_KEY);
              reject(retryError);
            });
        }, 1000);
      });
    })
  );
}

/**
 * Clear the chunk reload flag on successful app boot.
 * Call this once in your app entry point.
 */
export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}
