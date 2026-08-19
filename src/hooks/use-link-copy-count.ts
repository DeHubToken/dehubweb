/**
 * Post link-copy tracking
 * =======================
 * A "copy link" is a share, and counts alongside reposts in the number beside
 * the share button. Rows live in the `post_link_copies` Supabase table (see
 * supabase/migrations/20260716120000_post_link_copies.sql and
 * 20260819200000_post_link_copies_actor.sql); the client only ever touches it
 * through two security-definer RPCs.
 *
 * ONE COPY PER ACTOR PER POST
 * The dedupe key is `actor_id`: the lowercased wallet address when signed in,
 * otherwise a per-browser id kept in localStorage. So the counter behaves like
 * a repost — copying the same post ten times still reads as one share — and a
 * signed-out visitor cannot run the number up.
 *
 * READS ARE BATCHED
 * Every card in a feed mounts its own ActionBar, so a naive per-card query
 * would be one request per card. `loadLinkCopyCount` collects the ids asked
 * for within a tick and issues a single `get_post_link_copy_counts` RPC, which
 * already takes an array. One request per feed page, not one per post.
 *
 * OPTIMISTIC WITHOUT DOUBLE-COUNTING
 * Marking a copy stores a *floor* (the count at copy time, plus one) rather
 * than a delta, and the display takes `max(server, floor)`. A delta would be
 * added on top of the server count again as soon as the query refetched and
 * included the same copy; a floor is absorbed the moment the server catches
 * up, and it survives remount because it lives in a module-level store.
 *
 * Everything degrades to 0 / no-op if the migration has not been applied
 * (PGRST202), so shipping the frontend first is safe — the counter just shows
 * reposts alone, exactly as it did before.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const ACTOR_STORAGE_KEY = 'dhb_share_actor_id';

/**
 * Stable per-browser id for signed-out copies. Only ever used as a dedupe key
 * for this one counter — it is not an identifier the server joins on anything
 * else, and it is regenerated freely if storage is cleared.
 */
function getBrowserActorId(): string {
  try {
    const existing = localStorage.getItem(ACTOR_STORAGE_KEY);
    if (existing) return existing;
    const id = `web:${crypto.randomUUID()}`;
    localStorage.setItem(ACTOR_STORAGE_KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled: a per-session id still dedupes repeat
    // copies within the page, which is the case that actually inflates counts.
    return `web:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function actorIdFor(walletAddress?: string | null): string {
  const wallet = walletAddress?.trim().toLowerCase();
  return wallet || getBrowserActorId();
}

/* ------------------------------------------------------------------ *
 * Batched reads
 * ------------------------------------------------------------------ */

type Resolver = (count: number) => void;

let pendingIds = new Map<number, Resolver[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushPending() {
  flushTimer = null;
  const batch = pendingIds;
  pendingIds = new Map();
  const ids = [...batch.keys()];

  let rows: Array<{ token_id: number | string; copies: number | string }> = [];
  try {
    const { data, error } = await (supabase.rpc as any)('get_post_link_copy_counts', {
      p_token_ids: ids,
    });
    if (!error && Array.isArray(data)) rows = data;
  } catch {
    // Leave rows empty — every waiter resolves to 0 below.
  }

  const byId = new Map(rows.map((r) => [Number(r.token_id), Number(r.copies ?? 0)]));
  for (const [id, resolvers] of batch) {
    const count = byId.get(id) ?? 0;
    resolvers.forEach((resolve) => resolve(count));
  }
}

function loadLinkCopyCount(id: number): Promise<number> {
  return new Promise((resolve) => {
    const waiting = pendingIds.get(id);
    if (waiting) waiting.push(resolve);
    else pendingIds.set(id, [resolve]);
    if (!flushTimer) flushTimer = setTimeout(flushPending, 40);
  });
}

/* ------------------------------------------------------------------ *
 * Optimistic floor store
 * ------------------------------------------------------------------ */

const floors = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Lowest count this post may display, given a copy this session. 0 when none. */
export function getLinkCopyFloor(tokenId?: string): number {
  return tokenId ? floors.get(tokenId) ?? 0 : 0;
}

/**
 * Re-renders whenever any surface records a copy, so the shorts viewer and the
 * feed card behind it agree without either refetching.
 */
export function useLinkCopyFloor(tokenId?: string): number {
  const getSnapshot = useCallback(() => getLinkCopyFloor(tokenId), [tokenId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function raiseFloor(tokenId: string, serverCount: number) {
  const next = Math.max(floors.get(tokenId) ?? 0, serverCount + 1);
  floors.set(tokenId, next);
  emit();
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Aggregate link-copy count for one post. Returns 0 until data exists. */
export function usePostLinkCopyCount(tokenId?: string) {
  const id = tokenId ? parseInt(tokenId, 10) : NaN;
  return useQuery({
    queryKey: ['post-link-copies', tokenId],
    queryFn: () => loadLinkCopyCount(id),
    enabled: !isNaN(id),
    staleTime: 30_000,
    // The counter is a public total, so it should track other people's copies.
    // There is no realtime feed for it: the table's RLS has no policies (reads
    // are aggregate-only through the RPC), and Postgres changefeeds honour RLS,
    // so a subscription would deliver nothing without opening row reads and
    // exposing every copier's wallet. Refetching on focus is the closest thing
    // that does not widen access.
    refetchOnWindowFocus: true,
  });
}

/**
 * Record that the current user copied this post's link, and raise the local
 * floor so the number moves on the same tap.
 *
 * `currentCount` is the server count the caller is displaying right now — the
 * floor is built from it, so pass what the user can see.
 */
export function trackPostLinkCopy(
  tokenId: string | undefined,
  walletAddress?: string | null,
  currentCount = 0,
): Promise<void> {
  if (!tokenId) return Promise.resolve();
  const id = parseInt(tokenId, 10);
  if (isNaN(id)) return Promise.resolve();

  raiseFloor(tokenId, currentCount);

  return (supabase.rpc as any)('track_post_link_copy', {
    p_token_id: id,
    p_actor: actorIdFor(walletAddress),
    p_wallet: walletAddress?.toLowerCase() ?? null,
  }).then(
    () => {},
    () => {},
  );
}

/**
 * Copy-link handler helper: records the copy, then refreshes the count once the
 * write has landed so the displayed total becomes server-backed rather than
 * resting on the floor.
 */
export function useTrackPostLinkCopy() {
  const queryClient = useQueryClient();
  return useCallback(
    (tokenId: string | undefined, walletAddress?: string | null, currentCount = 0) => {
      void trackPostLinkCopy(tokenId, walletAddress, currentCount).then(() => {
        if (tokenId) {
          queryClient.invalidateQueries({ queryKey: ['post-link-copies', tokenId] });
        }
      });
    },
    [queryClient],
  );
}
