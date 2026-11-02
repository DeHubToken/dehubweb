// deno-lint-ignore-file no-explicit-any
//
// Stage clips: vertical shorts from a finished public Stage, for the brand
// accounts' TikTok, Reels and Shorts.
//
// summarize-transcript calls this once a public stage transcript is ready. It
// picks up to three 30-60 s stretches that stand on their own (the text helper
// summarize-transcript uses suggests, _shared/clip-highlights.ts checks and fills in),
// writes the captions, watermark and end card as one ASS overlay per clip, and
// hands the lot to the dub worker's host, which already runs ffmpeg
// (services/auto-dub/clips.py). The worker holds no database key: it uploads
// through signed URLs minted here and reports back with the shared worker
// secret. A finished clip becomes a `stage_clip` item in growth_autopost_queue,
// always pending review.
//
// Two entry points:
//   { stageId }                                     service key only. Plans and
//        dispatches a stage, or retries its failed clips and queues finished
//        ones that are not queued yet. Safe to repeat.
//   { action: 'complete', secret, clipId, jobId, ok, path | error }
//                                                   the worker, per clip.
//
// Without a worker URL and secret this does nothing and says so.
import { admin, corsHeaders, DEHUB_API_BASE, json, normalizeTarget } from '../_shared/transcripts.ts';
import { aiChat } from '../_shared/ai-chat.ts';
import { stageClip, stageLink, textsFor } from '../_shared/growth-posts.ts';
import {
  buildAss, buildCues, clipWords, HIGHLIGHT_PROMPT, hostBlocksClips, looksMature, normalizeSegments, parseSuggestions,
  pickHighlights, promptTranscript, type Segment, type Suggestion,
} from '../_shared/clip-highlights.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TEXT_KEY = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
const BUCKET = 'stage-clips';
const MAX_ATTEMPTS = 3;
/** A dispatched clip with no callback after this long is tried again. */
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PLATFORMS = ['tiktok', 'instagram', 'youtube'];
const LOG = '[stage-clips]';

interface ClipRow {
  id: string;
  stage_id: string;
  idx: number;
  start_seconds: number;
  end_seconds: number;
  hook: string;
  title: string;
  status: string;
  job_id: string | null;
  attempts: number;
  last_attempt_at: string | null;
  video_url: string | null;
  queued_at: string | null;
}

interface StageRow {
  id: string;
  short_id: number | null;
  title: string;
  description: string | null;
  status: string;
  recording_url: string | null;
  host_wallet_address: string;
  host_username: string | null;
  host_avatar: string | null;
  cover_image_url: string | null;
}

/* ─────────────────────────────── worker ─────────────────────────────────── */

type WorkerConfig = { url: string; secret: string; configured: boolean };

/**
 * Same host and secret as the dub worker. Its route is configured as
 * …/jobs, and the clip route sits next to it; STAGE_CLIP_WORKER_URL overrides.
 */
async function workerConfig(db: any): Promise<WorkerConfig> {
  const { data } = await db.from('video_dub_worker').select('worker_url, secret').eq('id', 1).maybeSingle();
  const explicit = Deno.env.get('STAGE_CLIP_WORKER_URL') ?? '';
  const dub = Deno.env.get('DUB_WORKER_URL') || data?.worker_url || '';
  const derived = /\/jobs\/?$/.test(dub) ? dub.replace(/\/jobs\/?$/, '/clips') : '';
  const url = [explicit, derived].find((u) => u.startsWith('https://')) ?? '';
  const secret = Deno.env.get('DUB_WORKER_SECRET') || data?.secret || '';
  return { url, secret, configured: !!url && !!secret };
}

const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
const clipPath = (row: { stage_id: string; id: string }, jobId: string) => `${row.stage_id}/${row.id}/${jobId}.mp4`;

/* ─────────────────────────────── picking ────────────────────────────────── */

async function viaAiChat(prompt: string, skipGateway: boolean): Promise<string | null> {
  if (!TEXT_KEY) return null;
  try {
    const res = await aiChat({
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: HIGHLIGHT_PROMPT },
        { role: 'user', content: prompt },
      ],
    }, { label: 'stage-clips', publicContent: true, skipGateway });
    if (!res.ok) {
      console.error(`${LOG} suggest ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const j = await res.json();
    return (j?.choices?.[0]?.message?.content ?? '').trim() || null;
  } catch (e) {
    console.error(`${LOG} suggest failed`, e);
    return null;
  }
}

/** Suggested picks, free and direct tiers first, as summarize-transcript does. */
async function suggest(stage: StageRow, segments: Segment[]): Promise<Suggestion[]> {
  const prompt = `Stage title: ${stage.title}\n\n${promptTranscript(segments)}`;
  const raw = (await viaAiChat(prompt, true)) ?? (await viaAiChat(prompt, false));
  return parseSuggestions(raw);
}

/* ───────────────────────────── eligibility ──────────────────────────────── */

async function hostAccount(wallet: string): Promise<any | null> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(wallet)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.result ?? body ?? null;
  } catch {
    return null;
  }
}

/**
 * Why a stage may not be clipped, or null. Only an ended stage with a recording
 * and a public, ready transcript; never adult wording; never a banned or adult
 * host, and never when the host cannot be looked up (asked again next time).
 */
async function ineligible(db: any, stage: StageRow | null): Promise<{ reason: string; segments?: Segment[] }> {
  if (!stage) return { reason: 'stage not found' };
  if (stage.status !== 'ended' || !stage.recording_url) return { reason: 'stage has no finished recording' };
  const { data: t } = await db.from('transcripts').select('status, visibility, segments')
    .eq('source_kind', 'stage').eq('source_ref', stage.id).maybeSingle();
  if (!t || t.status !== 'ready') return { reason: 'transcript not ready' };
  if (t.visibility !== 'public') return { reason: 'transcript not public' };
  if (looksMature(stage.title, stage.description)) return { reason: 'mature stage' };
  if (hostBlocksClips(await hostAccount(stage.host_wallet_address))) return { reason: 'host not eligible or not reachable' };
  return { reason: '', segments: normalizeSegments(t.segments) };
}

/* ─────────────────────────────── dispatch ───────────────────────────────── */

function retryable(row: ClipRow): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  if (row.status === 'pending' || row.status === 'failed') return true;
  if (row.status !== 'processing') return false;
  return Date.now() - (row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0) > STALE_PROCESSING_MS;
}

async function dispatch(db: any, stage: StageRow, segments: Segment[], rows: ClipRow[], worker: WorkerConfig) {
  const host = stage.host_username ? `Hosted by ${stage.host_username}` : undefined;
  const cardUrl = stageLink(stage).replace(/^https:\/\//, '');
  const clips: any[] = [];
  for (const row of rows) {
    const jobId = crypto.randomUUID();
    const path = clipPath(row, jobId);
    const { data: signed, error: signErr } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signed?.signedUrl) {
      console.error(`${LOG} signed upload url failed`, signErr);
      continue;
    }
    // Compare-and-set, so two overlapping calls cannot render the same clip twice.
    const { data: claimed } = await db.from('stage_clips').update({
      status: 'processing', job_id: jobId, attempts: row.attempts + 1,
      last_attempt_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('status', row.status).eq('attempts', row.attempts).select('id');
    if (!claimed?.length) continue;

    const start = Number(row.start_seconds);
    const end = Number(row.end_seconds);
    clips.push({
      clipId: row.id,
      jobId,
      start,
      end,
      path,
      uploadUrl: signed.signedUrl,
      ass: buildAss(buildCues(clipWords(segments, start, end)), end - start, { title: 'Hear the full Stage', url: cardUrl, host }),
    });
  }
  if (!clips.length) return { dispatched: 0 };

  const image = [stage.cover_image_url, stage.host_avatar].find((u) => typeof u === 'string' && u.startsWith('https://'));
  const fail = (error: string) => db.from('stage_clips').update({ status: 'failed', error, updated_at: new Date().toISOString() })
    .in('id', clips.map((c) => c.clipId)).eq('status', 'processing');
  let res: Response;
  try {
    res = await fetch(worker.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker.secret}` },
      body: JSON.stringify({
        input: {
          stageId: stage.id,
          recordingUrl: stage.recording_url,
          ...(image ? { imageUrl: image } : {}),
          callbackUrl: `${SUPABASE_URL}/functions/v1/stage-clips`,
          clips,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // The worker may have taken a job whose answer was lost: keep the claim
    // until a callback lands or it goes stale, rather than render twice.
    return { dispatched: clips.length, uncertain: true };
  }
  if (!res.ok) {
    console.error(`${LOG} worker ${res.status}`);
    await fail(`clip worker ${res.status}`);
    return { dispatched: 0, error: `clip worker ${res.status}` };
  }
  await res.body?.cancel();
  return { dispatched: clips.length };
}

/* ──────────────────────────────── queue ─────────────────────────────────── */

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
const missingTable = (e: any) => e?.code === '42P01' || e?.code === 'PGRST205';

/**
 * Put a finished clip in front of an admin. Follows the autopost settings for
 * whether stage clips are on, which platforms and how many a day; never
 * auto-approves. Leaves the clip unqueued (and says why) when it cannot.
 */
async function enqueue(db: any, stage: StageRow, row: ClipRow): Promise<string> {
  if (!row.video_url || row.queued_at) return 'nothing to queue';
  const { data: settings, error } = await db.from('growth_autopost_settings')
    .select('enabled_kinds, platforms, daily_caps').eq('id', true).maybeSingle();
  if (missingTable(error)) {
    console.warn(`${LOG} growth_autopost_queue is not installed; clip ${row.id} stays unqueued`);
    return 'queue not installed';
  }
  if (error) throw error;
  if (settings && !(settings.enabled_kinds ?? []).includes('stage_clip')) return 'stage clips are switched off';

  const platforms: string[] = (Array.isArray(settings?.platforms?.stage_clip) ? settings.platforms.stage_clip : DEFAULT_PLATFORMS)
    .map(String);
  if (!platforms.length) return 'no platforms for stage clips';
  const cap = Number(settings?.daily_caps?.stage_clip ?? 3);
  const { count } = await db.from('growth_autopost_queue').select('id', { count: 'exact', head: true })
    .eq('kind', 'stage_clip').gte('created_at', startOfDay(new Date()));
  if ((count ?? 0) >= cap) return 'daily cap reached';

  const draft = stageClip({ stage, index: row.idx, hook: row.hook, videoUrl: row.video_url }, new Date());
  const { error: insertError } = await db.from('growth_autopost_queue').upsert({
    kind: draft.kind,
    platforms,
    text: textsFor(draft, platforms),
    media: draft.media,
    link: draft.link,
    source_ref: draft.sourceRef,
    status: 'pending_review',
    scheduled_for: draft.scheduledFor.toISOString(),
  }, { onConflict: 'kind,source_ref', ignoreDuplicates: true });
  if (insertError) throw insertError;
  await db.from('stage_clips').update({ queued_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
  return 'queued';
}

/* ──────────────────────────────── plan ──────────────────────────────────── */

const STAGE_COLUMNS = 'id, short_id, title, description, status, recording_url, host_wallet_address, host_username, host_avatar, cover_image_url';
const CLIP_COLUMNS = 'id, stage_id, idx, start_seconds, end_seconds, hook, title, status, job_id, attempts, last_attempt_at, video_url, queued_at';

async function plan(db: any, stageId: string) {
  const worker = await workerConfig(db);
  if (!worker.configured) {
    console.warn(`${LOG} worker not configured: set DUB_WORKER_SECRET and a dub worker URL (or STAGE_CLIP_WORKER_URL); ${stageId} skipped`);
    return { ok: true, skipped: 'worker not configured' };
  }

  const { data: stage } = await db.from('audio_spaces').select(STAGE_COLUMNS).eq('id', stageId).maybeSingle();
  const check = await ineligible(db, stage);
  if (check.reason) {
    console.log(`${LOG} ${stageId} skipped: ${check.reason}`);
    return { ok: true, skipped: check.reason };
  }
  const segments = check.segments!;

  let { data: rows } = await db.from('stage_clips').select(CLIP_COLUMNS).eq('stage_id', stageId).order('idx');
  if (!rows?.length) {
    const picks = pickHighlights(segments, await suggest(stage, segments));
    if (!picks.length) {
      console.log(`${LOG} ${stageId} skipped: no stand-alone stretch of 30-60 s`);
      return { ok: true, skipped: 'no highlight' };
    }
    const { data: inserted, error } = await db.from('stage_clips').upsert(picks.map((p, idx) => ({
      stage_id: stageId,
      idx,
      start_seconds: p.start,
      end_seconds: p.end,
      hook: p.hook,
      title: p.title,
    })), { onConflict: 'stage_id,idx', ignoreDuplicates: true }).select(CLIP_COLUMNS);
    if (error) throw error;
    rows = inserted ?? [];
  }

  const queued: Record<string, string> = {};
  for (const row of (rows ?? []) as ClipRow[]) {
    if (row.status === 'ready' && !row.queued_at) queued[row.id] = await enqueue(db, stage, row);
  }
  const due = ((rows ?? []) as ClipRow[]).filter(retryable);
  const sent = due.length ? await dispatch(db, stage, segments, due, worker) : { dispatched: 0 };
  return { ok: true, clips: (rows ?? []).length, ...sent, ...(Object.keys(queued).length ? { queued } : {}) };
}

/* ─────────────────────────────── complete ───────────────────────────────── */

async function complete(db: any, body: any) {
  const worker = await workerConfig(db);
  if (!worker.secret || typeof body?.secret !== 'string' || body.secret !== worker.secret) return json({ error: 'forbidden' }, 403);
  const clipId = String(body?.clipId ?? '');
  const jobId = String(body?.jobId ?? '');
  if (!clipId || !jobId) return json({ error: 'clipId and jobId required' }, 400);

  const { data: row } = await db.from('stage_clips').select(CLIP_COLUMNS).eq('id', clipId).eq('job_id', jobId).maybeSingle();
  if (!row || row.status !== 'processing') return json({ ok: true, ignored: true });

  if (body?.ok === true && typeof body?.path === 'string') {
    if (body.path !== clipPath(row, jobId)) return json({ error: 'unexpected clip path' }, 400);
    const duration = Number(body?.durationSeconds);
    const { data: done, error } = await db.from('stage_clips').update({
      status: 'ready',
      video_url: publicUrl(body.path),
      duration_seconds: Number.isFinite(duration) ? duration : null,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', clipId).eq('job_id', jobId).eq('status', 'processing').select(CLIP_COLUMNS);
    if (error) return json({ error: 'could not save clip' }, 500);
    if (!done?.length) return json({ ok: true, ignored: true });
    const { data: stage } = await db.from('audio_spaces').select(STAGE_COLUMNS).eq('id', row.stage_id).maybeSingle();
    let queued = 'stage gone';
    if (stage) {
      try {
        queued = await enqueue(db, stage, done[0]);
      } catch (e: any) {
        console.error(`${LOG} enqueue ${clipId}`, e);
        queued = 'queue error';
      }
    }
    console.log(`${LOG} clip ${clipId} ready (${queued})`);
    return json({ ok: true, queued });
  }

  await db.from('stage_clips').update({
    status: 'failed',
    error: String(body?.error ?? 'worker failed').slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq('id', clipId).eq('job_id', jobId).eq('status', 'processing');
  return json({ ok: true });
}

/* ─────────────────────────────── handler ────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    if (body?.action === 'complete') return await complete(db, body);

    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!SERVICE_KEY || bearer !== SERVICE_KEY) return json({ error: 'forbidden' }, 403);
    const target = normalizeTarget({ kind: 'stage', ref: String(body?.stageId ?? '') });
    if (!target) return json({ error: 'stageId required' }, 400);
    return json(await plan(db, target.ref));
  } catch (e: any) {
    console.error(`${LOG} error`, e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
