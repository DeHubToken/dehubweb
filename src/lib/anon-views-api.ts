/**
 * Anonymous views API
 * ===================
 * Client for the `anon-views` Supabase edge function — the backend for views
 * from visitors with no DeHub session, since api.dehub.io requires a JWT on its
 * own view endpoints.
 *
 * Both the write path (view-tracker) and the read path (anon view counts merged
 * into displayed totals) go through here.
 */

import { getAnonViewerId } from '@/lib/anon-view-id';

// Same publishable project URL and fallback as src/integrations/supabase/client.ts.
// Duplicated rather than imported because that file is generated, and because
// recordAnonViewsBeacon needs a plain URL: navigator.sendBeacon cannot set
// headers, so it cannot go through supabase.functions.invoke.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://aigxuutjaqsywioxjefr.supabase.co";

const ANON_VIEWS_URL = `${SUPABASE_URL}/functions/v1/anon-views`;

export interface AnonViewRecordResponse {
  success: boolean;
  recorded: number;
  submitted: number;
}

/**
 * Record anonymous views for one or more posts. Returns null on any failure —
 * view tracking is best-effort and must never surface an error to the viewer.
 */
export async function recordAnonViews(tokenIds: string[]): Promise<AnonViewRecordResponse | null> {
  if (tokenIds.length === 0) return null;

  try {
    const response = await fetch(ANON_VIEWS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ tokenIds, deviceId: getAnonViewerId() }),
    });

    if (!response.ok) {
      console.error('[AnonViews] record failed:', response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('[AnonViews] record error:', error);
    return null;
  }
}

/**
 * Fire-and-forget variant for page unload. A normal fetch started during
 * `beforeunload` or a hide is usually cancelled with the document, so the final
 * batch is lost; sendBeacon hands the request to the browser to deliver after
 * the page is gone. Returns false if the beacon could not be queued, so the
 * caller can fall back to a regular request.
 */
export function recordAnonViewsBeacon(tokenIds: string[]): boolean {
  if (tokenIds.length === 0) return false;
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;

  try {
    const payload = JSON.stringify({ tokenIds, deviceId: getAnonViewerId() });
    // A Blob with an explicit type is how sendBeacon sends JSON; it cannot set
    // headers, and the edge function runs with verify_jwt = false so no apikey
    // header is needed.
    const blob = new Blob([payload], { type: 'application/json' });
    return navigator.sendBeacon(ANON_VIEWS_URL, blob);
  } catch {
    return false;
  }
}

/**
 * Fetch anonymous view totals for a set of posts. Returns a map of token id to
 * count; posts with no anonymous views are absent from the map, so callers
 * should treat a missing key as zero. Returns an empty map on failure.
 */
export async function fetchAnonViewCounts(tokenIds: string[]): Promise<Record<string, number>> {
  if (tokenIds.length === 0) return {};

  try {
    const query = new URLSearchParams({ token_ids: tokenIds.join(',') });
    const response = await fetch(`${ANON_VIEWS_URL}?${query.toString()}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error('[AnonViews] count fetch failed:', response.status);
      return {};
    }

    const body = await response.json();
    return (body?.counts as Record<string, number>) || {};
  } catch (error) {
    console.error('[AnonViews] count fetch error:', error);
    return {};
  }
}
