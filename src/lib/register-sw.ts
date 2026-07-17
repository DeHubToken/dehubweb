/**
 * Service worker registration
 * ===========================
 * Registers /sw.js in production only. Dev is skipped because a SW + Vite HMR
 * fight each other (stale module graph, hard reloads). Registration is deferred
 * to `load` so it never competes with the boot feed fetch / first paint for
 * bandwidth on a slow connection.
 *
 * @module lib/register-sw
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Never register in dev — HMR and a caching SW don't coexist cleanly.
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure is non-fatal — the app works exactly as before,
      // just without offline/instant-repeat caching.
    });
  });
}
