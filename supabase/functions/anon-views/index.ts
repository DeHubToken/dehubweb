/**
 * anon-views
 * ==========
 * Records and serves post views for visitors with no DeHub session.
 *
 * Why this exists: api.dehub.io requires a valid JWT on /api/record-view and
 * /api/view/batch (no header → 400 "Invalid signature", bad token → 401), so a
 * signed-out visitor scrolling the feed records nothing. Signed-in views still
 * go to the DeHub API; only signed-out ones land here, so the two halves never
 * double-count the same person.
 *
 * Endpoints (verify_jwt = false — anonymous by definition):
 *   POST /            { tokenIds: string[], deviceId: string } → { recorded }
 *   GET  /?token_ids=1,2,3                                     → { counts: {} }
 *
 * Dedup is one view per viewer per post per UTC day, enforced by a unique index
 * in record_anonymous_views. The viewer identity is a salted SHA-256 of the
 * client-supplied device id plus the request IP: the device id alone is
 * clearable, the IP alone is shared by everyone behind a NAT, and the salt makes
 * the hash useless to anyone who obtains the table. The raw IP is never stored.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Matches MAX_BATCH_SIZE in src/lib/view-tracker.ts. A request carrying more
// than this is a client bug or an inflation attempt; we take the first slice
// rather than rejecting outright so a genuine oversized batch still counts.
const MAX_TOKENS_PER_REQUEST = 50;

// Token ids are numeric strings in the DeHub API. Rejecting anything else keeps
// junk out of the totals table, which is keyed by token_id.
const TOKEN_ID_PATTERN = /^\d{1,20}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ success: false, message }, status);
}

/**
 * The client's IP, as seen through Supabase's edge proxy.
 *
 * cf-connecting-ip is set by Cloudflare directly from the TCP connection and
 * is stripped/overwritten on the way in, so a caller cannot forge it — prefer
 * it whenever present.
 *
 * x-forwarded-for is attacker-controllable: a client can prepend any fake
 * value to it before the request ever reaches a trusted proxy, so taking
 * "the first entry" really means "whatever the caller put there." Trusting it
 * would let a script rotate a fake IP on every request and, combined with a
 * freely-rotatable deviceId, mint unlimited "new" viewer hashes and defeat the
 * one-view-per-viewer-per-day dedup entirely. Only fall back to it as a
 * last resort when no trusted header is present.
 */
function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}

async function hashViewer(deviceId: string, ip: string): Promise<string> {
  // Falls back to the service role key as salt if ANON_VIEW_SALT is unset, so a
  // missing env var degrades to "still salted with a project-local secret"
  // rather than to an unsalted, rainbow-table-able hash of an IP address.
  const salt = Deno.env.get('ANON_VIEW_SALT')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || '';
  const data = new TextEncoder().encode(`${salt}|${deviceId}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeTokenIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const id = String(value).trim();
    if (TOKEN_ID_PATTERN.test(id)) seen.add(id);
    if (seen.size >= MAX_TOKENS_PER_REQUEST) break;
  }
  return Array.from(seen);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Read: aggregate counts for a set of posts ──
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const tokenIds = normalizeTokenIds(
        (url.searchParams.get('token_ids') || '').split(',').filter(Boolean),
      );

      if (tokenIds.length === 0) {
        return json({ success: true, counts: {} });
      }

      const { data, error } = await supabase.rpc('get_anonymous_view_counts', {
        p_token_ids: tokenIds,
      });

      if (error) {
        console.error('[anon-views] count query failed:', error);
        return errorResponse('Failed to fetch view counts', 500);
      }

      const counts: Record<string, number> = {};
      for (const row of (data || []) as Array<{ token_id: string; view_count: number }>) {
        counts[row.token_id] = Number(row.view_count) || 0;
      }

      return json({ success: true, counts });
    }

    // ── Write: record a batch of anonymous views ──
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body');
      }

      const tokenIds = normalizeTokenIds(body.tokenIds);
      if (tokenIds.length === 0) {
        return errorResponse('tokenIds must contain at least one numeric token id');
      }

      // The device id is required but not trusted — it is only one of two
      // ingredients in the viewer hash, and the other (the IP) is not
      // client-controlled, so forging it cannot inflate a count past one view
      // per IP per post per day.
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : '';
      if (!deviceId) {
        return errorResponse('deviceId is required');
      }

      const viewerHash = await hashViewer(deviceId, getClientIp(req));

      const { data, error } = await supabase.rpc('record_anonymous_views', {
        p_token_ids: tokenIds,
        p_viewer_hash: viewerHash,
      });

      if (error) {
        console.error('[anon-views] record failed:', error);
        return errorResponse('Failed to record views', 500);
      }

      const recorded = Number(data) || 0;
      console.log(`[anon-views] recorded ${recorded}/${tokenIds.length} anonymous views`);

      return json({ success: true, recorded, submitted: tokenIds.length });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    console.error('[anon-views] unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
});
