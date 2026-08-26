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
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  if (PERSIST_ROOTS.has(root)) return true;

  /*
   * The conversation LIST, not the threads. Messages is the page that most
   * obviously reloaded from nothing every time — mobile has persisted its whole
   * query cache since day one, so the two clients differed here for no reason.
   *
   * Threads (`['messages','thread',id]`) stay out deliberately: they are
   * unbounded in a way the list is not (50 contacts vs every message ever
   * scrolled back through), and they are the most private thing the app holds.
   * The list already costs a name and a last-message preview; whole
   * conversations at rest is a different trade, and it buys nothing the
   * 2s refetch on opening a thread does not.
   */
  if (root === 'messages') return queryKey[1] === 'conversations';

  /*
   * Notification list only. `unreadCount` is deliberately excluded — a count is
   * the one thing here that is read as authoritative rather than as a preview,
   * and painting a stale badge is worse than painting none.
   */
  if (root === 'notifications') return queryKey[1] === 'list';

  return false;
}

/**
 * Infinite queries hold every page the user scrolled through. Persisting all of
 * them is what makes this blob big enough to trip its own 2 MB budget — and the
 * budget's fallback is to drop everything except the feed, so a long scroll
 * session quietly cost the profile and post slices their persistence.
 *
 * Only the first page is worth keeping: it is what paints, and the rest refetch
 * on scroll anyway. Mobile's persister has always trimmed this way
 * (`trimPersistedClient` in config/queryClient.ts); web never did.
 */
function trimInfinitePages(state: ReturnType<typeof dehydrate>): ReturnType<typeof dehydrate> {
  return {
    ...state,
    queries: state.queries.map((q) => {
      const data = q.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
      if (!data || !Array.isArray(data.pages) || data.pages.length <= 1) return q;
      return {
        ...q,
        state: {
          ...q.state,
          data: {
            ...data,
            pages: data.pages.slice(0, 1),
            pageParams: Array.isArray(data.pageParams) ? data.pageParams.slice(0, 1) : data.pageParams,
          },
        },
      };
    }),
  };
}

/**
 * Drop the persisted slice outright. Called on sign-out: the blob now carries
 * the conversation list, so "this browser forgets the session" has to mean the
 * previews go with it. The debounced writer would eventually overwrite it with
 * an empty cache, but a tab closed straight after logging out never reaches
 * that — and a privacy property should not rest on a race with an idle
 * callback.
 */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(PERSIST_KEY); } catch { /* nothing else to do */ }
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
    return JSON.stringify({ t: Date.now(), state: trimInfinitePages(state) });
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
