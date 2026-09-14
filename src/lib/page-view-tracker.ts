/**
 * Page view tracker
 * =================
 * Records where people go in the app, in batches, through the
 * `record_page_views` RPC (see the 20260914120000 migration).
 *
 * There was no navigation tracking of any kind before this: no third-party
 * beacon on the page, and client_error_logs only ever receives explicit
 * error/warn calls. So questions like "how many people reach the buy page, and
 * what were they looking at first" were unanswerable rather than merely
 * unanswered.
 *
 * Two things this deliberately copies from src/lib/logger.ts, both learned the
 * hard way there:
 *   * the exit flush goes out with `keepalive`, because an ordinary fetch is
 *     cancelled the moment the document goes away — and the last page someone
 *     saw before closing the tab is exactly the row worth having;
 *   * the endpoint and auth headers are read off the live Supabase client, so
 *     they cannot drift from the generated config.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAnonViewerId } from '@/lib/anon-view-id';
import { normalisePath, referrerHost } from '@/lib/page-path';

// The generated Supabase types are regenerated from the dashboard and do not
// yet carry record_page_views; this is the one call that needs the escape.
const db = supabase as unknown as {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
};

interface QueuedView {
  path: string;
  prevPath?: string;
  referrerHost?: string;
}

// Matches the `ord <= 50` cap the RPC applies to a batch.
const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 15_000;

const QUEUE: QueuedView[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lastPath: string | null = null;
let currentAddress: string | null = null;

/** Called by the auth-aware hook so batches can be attributed when signed in. */
export function setPageViewAddress(address: string | null | undefined): void {
  currentAddress = address ?? null;
}

async function flush(): Promise<void> {
  if (QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, MAX_BATCH);

  try {
    const { error } = await db.rpc('record_page_views', {
      p_events: batch,
      p_viewer_id: getAnonViewerId(),
      p_address: currentAddress,
    });
    if (error) console.warn('[PageViews] Failed to flush batch:', error);
  } catch {
    /* analytics must never surface to the user */
  }
}

/**
 * The exit path. `supabase.rpc` is an ordinary fetch and dies with the
 * document; this posts the same call straight at PostgREST with `keepalive`.
 */
function flushOnExit(): void {
  if (QUEUE.length === 0) return;

  const rest = (supabase as unknown as { rest?: { url?: string; headers?: Record<string, string> } }).rest;
  const url = rest?.url;
  if (!url) {
    void flush();
    return;
  }

  const batch = QUEUE.splice(0, MAX_BATCH);
  try {
    fetch(`${url}/rpc/record_page_views`, {
      method: 'POST',
      keepalive: true,
      headers: { ...(rest.headers || {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_events: batch,
        p_viewer_id: getAnonViewerId(),
        p_address: currentAddress,
      }),
    }).catch(() => { /* the page is going away; there is nobody to tell */ });
  } catch {
    /* ignore */
  }
}

function ensureTimer(): void {
  if (flushTimer || typeof document === 'undefined') return;
  flushTimer = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnExit();
  });
  window.addEventListener('pagehide', flushOnExit);
}

/**
 * Record one navigation. Repeats of the same route shape in a row are dropped
 * — a re-render or a query-string change is not a second visit.
 */
export function recordPageView(pathname: string): void {
  if (typeof window === 'undefined') return;

  const path = normalisePath(pathname);
  if (path === lastPath) return;

  const prevPath = lastPath;
  const host = prevPath ? null : referrerHost(document.referrer, window.location.host);
  lastPath = path;

  QUEUE.push({
    path,
    ...(prevPath ? { prevPath } : {}),
    ...(host ? { referrerHost: host } : {}),
  });

  ensureTimer();
  if (QUEUE.length >= MAX_BATCH) void flush();
}
