// deno-lint-ignore-file no-explicit-any
//
// The sweeper. Runs on cron and makes transcripts exist without anybody asking.
//
// Stages had one of these (`auto-transcribe-ended-stages`, deployed but never
// committed) and videos had nothing at all, so a video transcript only existed
// where somebody happened to press CC — five times in three months, against
// 779 video posts. This covers both, plus the retry pass that neither had.
//
// Three passes, in cost order:
//   1. retries   — rows that are pending, failed, or wedged in 'processing'
//   2. stages    — ended stages with a recording and no transcript
//   3. videos    — recent video posts with no transcript
//
// `{ backfill: true, page, pages }` walks further back through the feed for the
// one-off catch-up on everything posted before this existed. It needs the
// service key, because it is the only mode that can spend real money in bulk.
import { admin, corsHeaders, DEHUB_API_BASE, isRetryable, json } from '../_shared/transcripts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Per cron run. Each start costs a post lookup and a range request before it
 *  hands off, so this is a wall-clock budget as much as a spend one. */
const SWEEP_BUDGET = 12;
const BACKFILL_BUDGET = 40;
/** Fired in small waves rather than all at once — every start spawns its own
 *  background transcription. */
const WAVE = 4;

interface Started { kind: string; ref: string; reason: string }

async function startOne(kind: string, ref: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ kind, ref, action: 'start' }),
    });
    return res.ok || res.status === 202;
  } catch (e) {
    console.warn(`start ${kind}/${ref} failed`, e);
    return false;
  }
}

async function startAll(targets: Started[]): Promise<Started[]> {
  const done: Started[] = [];
  for (let i = 0; i < targets.length; i += WAVE) {
    const wave = targets.slice(i, i + WAVE);
    const results = await Promise.all(wave.map((t) => startOne(t.kind, t.ref)));
    wave.forEach((t, idx) => { if (results[idx]) done.push(t); });
  }
  return done;
}

/** One page of the public feed. No auth: this is the same list the app shows. */
async function feedPage(postType: string, page: number, limit: number): Promise<any[]> {
  const url = `${DEHUB_API_BASE}/api/feed?page=${page}&limit=${limit}&postType=${postType}&sortBy=createdAt&sortOrder=desc`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.warn(`feed ${postType} p${page} → ${res.status}`);
    return [];
  }
  const body = await res.json();
  return Array.isArray(body?.result) ? body.result : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const backfill = body?.backfill === true;

    if (backfill) {
      const auth = req.headers.get('Authorization') ?? '';
      if (!auth.includes(SERVICE_KEY)) return json({ error: 'backfill requires the service key' }, 401);
    }

    const budget = backfill ? BACKFILL_BUDGET : SWEEP_BUDGET;
    const db = admin();
    const queued: Started[] = [];

    /* ── 1. retries ─────────────────────────────────────────────────────── */
    const { data: unfinished } = await db
      .from('transcripts')
      .select('source_kind, source_ref, status, attempts, last_attempt_at')
      .in('status', ['pending', 'processing', 'failed'])
      .order('last_attempt_at', { ascending: true, nullsFirst: true })
      .limit(budget * 3);

    for (const row of unfinished ?? []) {
      if (queued.length >= budget) break;
      if (!isRetryable(row as any)) continue;
      queued.push({ kind: row.source_kind, ref: row.source_ref, reason: `retry:${row.status}` });
    }

    /* ── 2. ended stages with a recording ───────────────────────────────── */
    if (queued.length < budget) {
      const { data: stages } = await db
        .from('audio_spaces')
        .select('id')
        .eq('status', 'ended')
        .not('recording_url', 'is', null)
        .order('ended_at', { ascending: false })
        .limit(200);

      const stageIds = (stages ?? []).map((s: any) => String(s.id));
      if (stageIds.length) {
        const { data: known } = await db
          .from('transcripts')
          .select('source_ref')
          .eq('source_kind', 'stage')
          .in('source_ref', stageIds);
        const seen = new Set((known ?? []).map((r: any) => r.source_ref));
        for (const id of stageIds) {
          if (queued.length >= budget) break;
          if (seen.has(id)) continue;
          queued.push({ kind: 'stage', ref: id, reason: 'new stage' });
        }
      }
    }

    /* ── 3. video and audio posts ───────────────────────────────────────── */
    const startPage = Math.max(1, Number(body?.page ?? 1));
    const pages = backfill ? Math.max(1, Math.min(Number(body?.pages ?? 1), 10)) : 1;

    for (const postType of ['video', 'audio', 'feed-audio']) {
      for (let p = startPage; p < startPage + pages; p++) {
        if (queued.length >= budget) break;
        const posts = await feedPage(postType, p, 100);
        if (!posts.length) break;

        const kind = postType === 'video' ? 'video' : 'audio';
        const refs = posts
          .map((n: any) => String(n?.tokenId ?? ''))
          .filter((r: string) => r && r !== 'undefined');
        if (!refs.length) continue;

        const { data: known } = await db
          .from('transcripts')
          .select('source_ref')
          .eq('source_kind', kind)
          .in('source_ref', refs);
        const seen = new Set((known ?? []).map((r: any) => r.source_ref));

        for (const ref of refs) {
          if (queued.length >= budget) break;
          if (seen.has(ref)) continue;
          queued.push({ kind, ref, reason: `new ${postType}` });
        }
      }
    }

    const started = await startAll(queued);
    return json({
      ok: true,
      mode: backfill ? 'backfill' : 'sweep',
      considered: queued.length,
      started: started.length,
      targets: started,
    });
  } catch (e: any) {
    console.error('auto-transcribe error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
