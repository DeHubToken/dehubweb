/**
 * React Query cache persistence
 * =============================
 * Persists a small, whitelisted slice of the TanStack Query cache to
 * localStorage so a reload / return visit paints the *last* feed instantly —
 * before the network responds — then revalidates in the background.
 *
 * Why hand-rolled instead of @tanstack/react-query-persist-client?
 *   The deploy pipeline is sensitive to lockfile churn (pnpm-lock regen needed
 *   after any package.json change, and a stale lockfile has broken every deploy
 *   before). Keeping this dependency-free means the branch ships with no
 *   lockfile surgery. `dehydrate`/`hydrate` already live in @tanstack/react-query.
 *
 * Design notes:
 *   - localStorage (synchronous) so hydration completes at module-eval time in
 *     App.tsx, BEFORE HomeFeed's useInfiniteQuery first reads — that's what makes
 *     the paint instant. IndexedDB would hydrate a tick too late for first paint.
 *   - Only feed / post / profile queries are persisted. Balances, prices and
 *     other ephemeral or must-be-fresh data are never shown stale.
 *   - Hard 2MB budget with a trim-to-feed-only fallback so we never blow the
 *     ~5MB localStorage quota shared with auth/prefs/optimistic-post keys.
 *   - Writes happen on idle + on tab-hide, never synchronously on the scroll
 *     path, so the JSON.stringify cost stays off the critical rendering work.
 *
 * @module lib/query-persist
 */

import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

const PERSIST_KEY = 'dehub_rq_cache_v1';
const MAX_AGE = 24 * 60 * 60 * 1000; // 24h — older than this is dropped, not shown
const MAX_BYTES = 2_000_000; // ~2MB localStorage budget (chars ≈ bytes for ASCII JSON)

/**
 * Query-key roots worth persisting for instant-reload paint. Everything else is
 * either cheap to refetch or must never be rendered from stale storage.
 * Feed key shape: ['unified-feed', params, limit] (see use-unified-feed.ts).
 */
const PERSIST_ROOTS = new Set(['unified-feed', 'single-post', 'dehub-profile']);

function isPersistable(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && PERSIST_ROOTS.has(queryKey[0] as string);
}

/**
 * Rehydrate the persisted cache slice into the QueryClient. Call this
 * synchronously right after the client is created and BEFORE any boot prefetch,
 * so restored data is present when the first components read the cache.
 * Restored entries carry their original (old) timestamp, so React Query treats
 * them as stale and refetches — the user sees last-known content immediately
 * while fresh data loads behind it.
 */
export function restoreQueryCache(queryClient: QueryClient): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { t?: number; state?: unknown };
    if (!parsed || typeof parsed.t !== 'number' || !parsed.state) return;
    if (Date.now() - parsed.t > MAX_AGE) {
      localStorage.removeItem(PERSIST_KEY);
      return;
    }
    hydrate(queryClient, parsed.state);
  } catch {
    // Corrupt / unparseable cache — drop it and move on. Never block boot.
    try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
  }
}

/**
 * Begin persisting the whitelisted cache slice. Writes are debounced onto idle
 * time and flushed on tab-hide / pagehide, so the serialization cost never lands
 * on the scroll path.
 */
export function startQueryPersist(queryClient: QueryClient): void {
  if (typeof window === 'undefined') return;

  const serialize = (root?: string): string | null => {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (q) =>
        q.state.status === 'success' &&
        (root ? q.queryKey[0] === root : isPersistable(q.queryKey)),
      shouldDehydrateMutation: () => false,
    });
    return JSON.stringify({ t: Date.now(), state });
  };

  const write = () => {
    try {
      let payload = serialize();
      if (payload && payload.length > MAX_BYTES) {
        // Over budget — retry with just the primary feed, the highest-value slice.
        payload = serialize('unified-feed');
        if (payload && payload.length > MAX_BYTES) return; // still too big → skip
      }
      if (payload) localStorage.setItem(PERSIST_KEY, payload);
    } catch {
      // QuotaExceeded or serialization failure — non-fatal, try again next tick.
    }
  };

  // Idle-debounced write: coalesce bursts of cache updates into one serialize.
  const ric: (cb: () => void) => void =
    typeof (window as any).requestIdleCallback === 'function'
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
      : (cb) => window.setTimeout(cb, 1500);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    ric(() => { scheduled = false; write(); });
  };

  queryClient.getQueryCache().subscribe(schedule);

  // Flush the freshest state when the tab is backgrounded / closed, since the
  // idle write may not have fired yet.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') write();
  });
  window.addEventListener('pagehide', write);
}
