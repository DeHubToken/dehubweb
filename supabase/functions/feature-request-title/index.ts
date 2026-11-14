/**
 * Short titles for requests posted without one.
 * =============================================
 *
 * The Requests board asks for one free-form box. When the optional title is
 * left empty the client keeps the first line of the description as the title,
 * so the card repeats itself. This names those requests properly.
 *
 * - A database trigger calls this with `{ id }` straight after a request is
 *   posted (see migration 20261114030000_feature_request_auto_titles.sql), so
 *   every client gets it, old app builds included.
 * - Each call also catches up a couple of other recent untitled requests, so
 *   one that missed its turn (model busy, timeout) is fixed by the next post.
 * - `{ backfill: true }` walks the older ones too, a batch at a time.
 *
 * Only rows whose title is still a copy of the description are touched, and
 * each is named once (title_auto marks it). The write goes through
 * apply_feature_request_auto_title, which only replaces the exact title it
 * was given and leaves updated_at alone, so a request never jumps to the top
 * of the board or loses an edit the author made in the meantime.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCorsPreflight, jsonResponse, rateLimitByIp, serviceClient } from '../_shared/auth.ts';
import { tryFree } from '../_shared/free-models.ts';
import { createUsageMeter } from '../_shared/ai-usage.ts';
import { cleanTitle, isUntitled, titleMessages } from './title.ts';

interface Row {
  id: string;
  title: string;
  description: string;
  category: string | null;
  created_at: string;
  title_auto?: boolean | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Extra rows a normal call catches up on. */
const SWEEP_EXTRA = 2;
/** How far back a normal call looks for ones that missed their turn. */
const SWEEP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** Rows per backfill call. Each one is a single short model call. */
const BACKFILL_BATCH = 15;

async function nameOne(row: Row): Promise<string | null> {
  const meter = createUsageMeter('feature-request-title', 'free-title');
  try {
    const res = await tryFree({
      messages: titleMessages(row.description || row.title, row.category),
      temperature: 0.2,
      max_tokens: 60,
    }, {
      label: 'feature-request-title',
      // The board is public: anyone can read every request on it.
      publicContent: true,
      meter,
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) return null;
    const data = await res.json().catch(() => null);
    return cleanTitle(data?.choices?.[0]?.message?.content, row.description || row.title);
  } finally {
    meter.flush();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req) ?? new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const limited = await rateLimitByIp(req, 'feature-request-title', { limit: 120, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null;
  const backfill = body?.backfill === true;

  const db = serviceClient();
  const { data, error } = await db
    .from('feature_requests')
    .select('id, title, description, category, created_at, title_auto')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('feature-request-title: read failed', error.message);
    return jsonResponse({ error: 'read failed' }, 500);
  }

  const since = Date.now() - SWEEP_WINDOW_MS;
  const pending = ((data ?? []) as Row[]).filter((r) => !r.title_auto && isUntitled(r.title, r.description));
  const target = id ? pending.find((r) => r.id === id) : undefined;
  const others = pending.filter((r) => r.id !== id && (backfill || Date.parse(r.created_at) >= since));
  const queue = [
    ...(target ? [target] : []),
    ...others.slice(0, backfill ? BACKFILL_BATCH : SWEEP_EXTRA),
  ];

  const named: { id: string; title: string }[] = [];
  const failed: string[] = [];
  for (const row of queue) {
    const title = await nameOne(row);
    if (!title) { failed.push(row.id); continue; }
    const { data: applied, error: writeError } = await db.rpc('apply_feature_request_auto_title', {
      p_id: row.id, p_expected: row.title, p_title: title,
    });
    if (writeError) {
      console.error('feature-request-title: write failed', row.id, writeError.message);
      failed.push(row.id);
    } else if (applied) {
      named.push({ id: row.id, title });
    }
  }

  return new Response(JSON.stringify({
    named,
    failed,
    remaining: Math.max(0, pending.length - named.length),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
