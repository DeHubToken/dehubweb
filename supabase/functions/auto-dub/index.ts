// deno-lint-ignore-file no-explicit-any
//
// Auto-dub: dubbed audio for video posts, in the speaker's own voice.
//
// The transcript stack already produces the words (`transcripts`) and the
// translated words (`transcript_translations`), so a dub is only the missing
// third step — speech. That step runs on a rented GPU, not here: this function
// decides WHAT to dub, hands the worker a self-contained job, and records the
// answer. The worker holds no database key; it uploads through a signed URL
// minted per job and reports back with a shared secret.
//
// Three entry points, one file:
//   {}                                    the sweep, on cron every 10 minutes
//   { action: 'request', transcriptId | tokenId, lang }
//                                         a viewer asking for a language now
//   { action: 'complete', secret, dubId, ok, path | error }
//                                         the worker reporting a finished job
import { admin, corsHeaders, json, normalizeLang, parseTarget, DEHUB_CDN_BASE } from '../_shared/transcripts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RUNPOD_API_KEY = Deno.env.get('RUNPOD_API_KEY') ?? '';
const RUNPOD_ENDPOINT_ID = Deno.env.get('RUNPOD_DUB_ENDPOINT_ID') ?? '';
const WORKER_SECRET = Deno.env.get('DUB_WORKER_SECRET') ?? '';
const BUCKET = 'video-dubs';

/** Every language the synthesiser speaks. The picker offers more; a language
 *  outside this set can have subtitles but not a voice. */
export const DUB_LANGS = [
  'en', 'es', 'pt', 'fr', 'de', 'it', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko', 'hi',
];
/** Filled for every eligible video without anybody asking. */
const AUTO_LANGS = (Deno.env.get('DUB_AUTO_LANGS') || 'en,es,pt,fr,de,ar,hi,zh')
  .split(',').map((s) => s.trim()).filter((l) => DUB_LANGS.includes(l));
/** Sweeper ceiling. Longer videos are still dubbed, but only on request. */
const MAX_AUTO_SECONDS = Number(Deno.env.get('DUB_MAX_SECONDS') || 180);
const MAX_REQUEST_SECONDS = 900;

const SWEEP_BUDGET = 20;
/** How many recent transcripts the sweep opens rows for per run. */
const SWEEP_SCAN = 40;
const MAX_ATTEMPTS = 4;
const STALE_PROCESSING_MS = 30 * 60 * 1000;
/** Backoff after a failed attempt: 10 min, 1 h, 6 h. */
const RETRY_MS = [10, 60, 360].map((m) => m * 60 * 1000);

interface DubRow {
  id: string;
  transcript_id: string;
  language: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  updated_at: string;
}

function retryable(row: DubRow): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const since = Date.now() - (row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0);
  if (row.status === 'processing') return since > STALE_PROCESSING_MS;
  if (row.status === 'failed') return since > (RETRY_MS[Math.min(row.attempts - 1, RETRY_MS.length - 1)] ?? RETRY_MS[2]);
  return row.status === 'pending';
}

function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/* ─────────────────────────────── submit ─────────────────────────────────── */

type Submit = 'submitted' | 'waiting-translation' | 'skipped' | 'error';

/**
 * Hand one row to the worker. Returns without spending anything when the
 * translation is not there yet — it kicks one off and the next sweep finds it.
 */
async function submit(db: any, row: DubRow): Promise<Submit> {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID || !WORKER_SECRET) {
    console.warn('auto-dub: worker not configured (RUNPOD_API_KEY / RUNPOD_DUB_ENDPOINT_ID / DUB_WORKER_SECRET)');
    return 'error';
  }

  const { data: t } = await db
    .from('transcripts')
    .select('id, source_kind, source_ref, status, source_lang, duration_seconds, segments, visibility')
    .eq('id', row.transcript_id)
    .maybeSingle();
  if (!t || t.status !== 'ready' || t.visibility === 'private' || t.source_kind !== 'video') {
    await db.from('video_dubs').update({ status: 'failed', error: 'transcript not dubbable', attempts: MAX_ATTEMPTS }).eq('id', row.id);
    return 'skipped';
  }

  const { data: tr } = await db
    .from('transcript_translations')
    .select('status, segments')
    .eq('transcript_id', row.transcript_id)
    .eq('language', row.language)
    .maybeSingle();

  if (tr?.status !== 'ready') {
    if (tr?.status !== 'processing') {
      fetch(`${SUPABASE_URL}/functions/v1/translate-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ transcriptId: row.transcript_id, lang: row.language }),
      }).catch((e) => console.warn('translate kick failed', e));
    }
    return 'waiting-translation';
  }

  const path = `${t.source_ref}/${row.language}.m4a`;
  const { data: signed, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed?.signedUrl) {
    console.error('signed upload url failed', signErr);
    return 'error';
  }

  const input = {
    dubId: row.id,
    lang: row.language,
    sourceLang: normalizeLang(t.source_lang) ?? 'en',
    videoUrl: `${DEHUB_CDN_BASE}videos/${t.source_ref}.mp4`,
    segments: tr.segments ?? [],
    sourceSegments: t.segments ?? [],
    uploadUrl: signed.signedUrl,
    callbackUrl: `${SUPABASE_URL}/functions/v1/auto-dub`,
    secret: WORKER_SECRET,
  };

  const res = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RUNPOD_API_KEY}` },
    body: JSON.stringify({ input }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`runpod ${res.status}: ${bodyText}`);
    await db.from('video_dubs').update({
      status: 'failed',
      error: `runpod ${res.status}`,
      attempts: row.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    }).eq('id', row.id);
    return 'error';
  }
  let jobId: string | null = null;
  try { jobId = JSON.parse(bodyText)?.id ?? null; } catch { /* leave null */ }

  await db.from('video_dubs').update({
    status: 'processing',
    job_id: jobId,
    provider: 'xtts-v2',
    error: null,
    attempts: row.attempts + 1,
    last_attempt_at: new Date().toISOString(),
  }).eq('id', row.id);
  return 'submitted';
}

/* ─────────────────────────────── sweep ──────────────────────────────────── */

async function sweep(db: any) {
  /* 1. open rows for recent, short, public videos in the auto languages */
  const { data: recent } = await db
    .from('transcripts')
    .select('id, source_lang, duration_seconds')
    .eq('source_kind', 'video')
    .eq('status', 'ready')
    .eq('visibility', 'public')
    .not('source_lang', 'is', null)
    .lte('duration_seconds', MAX_AUTO_SECONDS)
    .gt('duration_seconds', 2)
    .order('updated_at', { ascending: false })
    .limit(SWEEP_SCAN);

  const wanted: { transcript_id: string; language: string }[] = [];
  for (const t of recent ?? []) {
    const src = normalizeLang(t.source_lang);
    for (const lang of AUTO_LANGS) {
      if (lang === src) continue;
      wanted.push({ transcript_id: t.id, language: lang });
    }
  }
  if (wanted.length) {
    // ignoreDuplicates: existing rows keep their status and attempts.
    await db.from('video_dubs').upsert(wanted, { onConflict: 'transcript_id,language', ignoreDuplicates: true });
  }

  /* 2. work the queue: oldest attempt first, newest rows first among fresh ones */
  const { data: queue } = await db
    .from('video_dubs')
    .select('id, transcript_id, language, status, attempts, last_attempt_at, updated_at')
    .in('status', ['pending', 'processing', 'failed'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('last_attempt_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(SWEEP_BUDGET * 4);

  const results: Record<Submit, number> = { submitted: 0, 'waiting-translation': 0, skipped: 0, error: 0 };
  let considered = 0;
  for (const row of (queue ?? []) as DubRow[]) {
    if (results.submitted >= SWEEP_BUDGET) break;
    if (!retryable(row)) continue;
    considered++;
    const r = await submit(db, row);
    results[r]++;
    if (r === 'error' && results.error >= 3) break; // the worker is down; stop burning attempts
  }
  return { opened: wanted.length, considered, ...results };
}

/* ─────────────────────────────── request ────────────────────────────────── */

async function request(db: any, body: any) {
  const lang = normalizeLang(body?.lang);
  if (!lang || !DUB_LANGS.includes(lang)) return json({ error: `unsupported language '${body?.lang}'` }, 400);

  const transcriptId = typeof body?.transcriptId === 'string' ? body.transcriptId : null;
  const target = transcriptId ? null : parseTarget(body);
  if (!transcriptId && !target) return json({ error: 'transcriptId or tokenId required' }, 400);

  const lookup = db.from('transcripts').select('id, status, source_lang, duration_seconds, visibility, source_kind');
  const { data: t } = await (transcriptId
    ? lookup.eq('id', transcriptId)
    : lookup.eq('source_kind', 'video').eq('source_ref', target!.ref)
  ).maybeSingle();
  if (!t || t.source_kind !== 'video') return json({ error: 'no video transcript' }, 404);
  if (t.status !== 'ready') return json({ ok: true, status: 'no-transcript' }, 409);
  if (t.visibility === 'private') return json({ error: 'transcript is private' }, 403);
  if (normalizeLang(t.source_lang) === lang) return json({ ok: true, status: 'same-as-source' });
  if (Number(t.duration_seconds ?? 0) > MAX_REQUEST_SECONDS) return json({ ok: true, status: 'too-long' });

  await db.from('video_dubs')
    .upsert({ transcript_id: t.id, language: lang }, { onConflict: 'transcript_id,language', ignoreDuplicates: true });
  const { data: row } = await db
    .from('video_dubs')
    .select('id, transcript_id, language, status, attempts, last_attempt_at, updated_at, audio_url')
    .eq('transcript_id', t.id)
    .eq('language', lang)
    .maybeSingle();
  if (!row) return json({ error: 'could not open dub row' }, 500);
  if (row.status === 'ready') return json({ ok: true, status: 'ready', audioUrl: row.audio_url });
  if (!retryable(row)) return json({ ok: true, status: row.status });

  const r = await submit(db, row);
  return json({ ok: true, status: r === 'submitted' ? 'processing' : r === 'waiting-translation' ? 'pending' : row.status, submit: r });
}

/* ─────────────────────────────── complete ───────────────────────────────── */

async function complete(db: any, body: any) {
  if (!WORKER_SECRET || body?.secret !== WORKER_SECRET) return json({ error: 'forbidden' }, 403);
  const dubId = String(body?.dubId ?? '');
  if (!dubId) return json({ error: 'dubId required' }, 400);

  if (body?.ok === true && typeof body?.path === 'string') {
    await db.from('video_dubs').update({
      status: 'ready',
      audio_url: publicUrl(body.path),
      voice: body?.voice === 'stock' ? 'stock' : 'cloned',
      duration_seconds: Number.isFinite(Number(body?.durationSeconds)) ? Math.round(Number(body.durationSeconds)) : null,
      error: null,
    }).eq('id', dubId);
    return json({ ok: true });
  }

  await db.from('video_dubs').update({
    status: 'failed',
    error: String(body?.error ?? 'worker failed').slice(0, 500),
  }).eq('id', dubId);
  return json({ ok: true });
}

/* ─────────────────────────────── handler ────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const action = String(body?.action ?? 'sweep');
    if (action === 'request') return await request(db, body);
    if (action === 'complete') return await complete(db, body);
    if (action === 'languages') return json({ languages: DUB_LANGS, auto: AUTO_LANGS });
    return json({ ok: true, ...(await sweep(db)) });
  } catch (e: any) {
    console.error('auto-dub error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
