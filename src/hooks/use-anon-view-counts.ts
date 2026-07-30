/**
 * Anonymous view count merging
 * ============================
 * Views from signed-out visitors are recorded by the `anon-views` edge function,
 * not by api.dehub.io, so a post's real total is the DeHub count plus the
 * anonymous count. The DeHub feed responses know nothing about the anonymous
 * half, so it is fetched here and added at display time.
 *
 * Requests are coalesced: every card that mounts registers its token id, and
 * ids that arrive within BATCH_WINDOW_MS go out as one request. Counts are
 * cached for CACHE_TTL_MS so scrolling back over a post does not refetch.
 */

import { useEffect, useState } from 'react';
import { fetchAnonViewCounts } from '@/lib/anon-views-api';
import { formatViews } from '@/lib/feed-utils';

const BATCH_WINDOW_MS = 150;
const CACHE_TTL_MS = 60_000;
const MAX_IDS_PER_REQUEST = 50; // Matches the edge function's cap.

// Token ids are numeric strings in the DeHub API; anything else is not a post.
const TOKEN_ID_PATTERN = /^\d{1,20}$/;

interface CacheEntry {
  count: number;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<(count: number) => void>>();
const pending = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function notify(tokenId: string, count: number): void {
  const listeners = subscribers.get(tokenId);
  if (!listeners) return;
  for (const listener of listeners) listener(count);
}

async function flushPending(): Promise<void> {
  batchTimer = null;
  if (pending.size === 0) return;

  const ids = Array.from(pending).slice(0, MAX_IDS_PER_REQUEST);
  for (const id of ids) pending.delete(id);

  const counts = await fetchAnonViewCounts(ids);
  const now = Date.now();

  for (const id of ids) {
    // Absent from the response means zero anonymous views, which is still worth
    // caching — otherwise every unviewed post refetches on each mount.
    const count = counts[id] ?? 0;
    cache.set(id, { count, fetchedAt: now });
    notify(id, count);
  }

  // More ids than one request could carry: keep draining.
  if (pending.size > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    void flushPending();
  }, BATCH_WINDOW_MS);
}

/**
 * The anonymous view count for a post, or 0 until it is known. Safe to call with
 * a non-numeric or empty id (returns 0 and issues no request).
 */
export function useAnonViewCount(tokenId?: string | number): number {
  const id = tokenId === undefined || tokenId === null ? '' : String(tokenId);
  const valid = TOKEN_ID_PATTERN.test(id);

  const [count, setCount] = useState(() => {
    const cached = cache.get(id);
    return cached ? cached.count : 0;
  });

  useEffect(() => {
    if (!valid) {
      setCount(0);
      return;
    }

    const cached = cache.get(id);
    if (cached) {
      setCount(cached.count);
      if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
    }

    let active = true;
    const listener = (value: number) => {
      if (active) setCount(value);
    };

    let listeners = subscribers.get(id);
    if (!listeners) {
      listeners = new Set();
      subscribers.set(id, listeners);
    }
    listeners.add(listener);

    pending.add(id);
    scheduleFlush();

    return () => {
      active = false;
      listeners!.delete(listener);
      if (listeners!.size === 0) subscribers.delete(id);
    };
  }, [id, valid]);

  return valid ? count : 0;
}

/**
 * Parse a display view count back to a number.
 *
 * The feed mappers format view counts to strings ("1.2K views") long before a
 * card renders, and the raw number is not carried alongside, so adding the
 * anonymous half means recovering the base from the formatted text. The value is
 * therefore accurate only to the precision the string already shows — a "1.2K"
 * base could be anything from 1200 to 1299 — which is the same precision the
 * merged total is displayed at, so the rounding is not newly visible.
 */
export function parseDisplayViewCount(value?: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value) return null;

  const match = /^\s*([\d,]*\.?\d+)\s*([KMB])?/i.exec(value);
  if (!match) return null;

  const base = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;

  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[
    (match[2] || '').toLowerCase()
  ] ?? 1;

  return base * multiplier;
}

/**
 * A post's view count with the anonymous half folded in, ready to display.
 *
 * Returns `viewCount` untouched when there are no anonymous views yet or when
 * the value cannot be parsed, so a card never renders worse than it did before.
 * The output keeps the input's shape: a number in, a number out; a string with a
 * " views" suffix keeps its suffix, one without stays bare.
 */
export function useMergedViewCount(
  tokenId?: string | number,
  viewCount?: string | number,
): string | number | undefined {
  const anonCount = useAnonViewCount(tokenId);

  if (anonCount <= 0 || viewCount === undefined || viewCount === null) return viewCount;

  const base = parseDisplayViewCount(viewCount);
  if (base === null) return viewCount;

  const total = base + anonCount;
  if (typeof viewCount === 'number') return total;

  const formatted = formatViews(total);
  return / views?\s*$/i.test(viewCount) ? formatted : formatted.replace(' views', '');
}
