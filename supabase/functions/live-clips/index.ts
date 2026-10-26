// deno-lint-ignore-file no-explicit-any
//
// Live clips: viewers clip a live video stream (or its replay) into a Short,
// and the streamer gets the room's best moments cut automatically.
//
// The stream's frames come from one of two places. While it is live, the
// worker on the dub host pulls the newest segments of its HLS playlist (what
// the CDN still holds, up to a minute) into one MP4 in the live-clips bucket.
// Once it has ended, its recording is the source and nothing is grabbed. Either
// way the clipper picks 3-60 s inside the window the row allows, the worker
// cuts a 1080x1920 MP4 with a poster and a share card, and the client posts
// that file as a Short through the normal mint call and reports the post back.
//
// Highlights are the same rows with kind 'highlight', cut where chat, reactions
// and gifts spiked (spikes.ts). Live Studio asks every minute while the
// streamer is on air, and once more after the replay is ready; the streamer
// approves (trims, titles, posts) or dismisses each one.
//
// Actions (POST JSON):
//   capture    { tokenId, at? }           signed in. `at` is the replay time.
//   get        { id }                     the clip, for the editor and its page.
//   list       { tokenId }                the stream's clips; drafts for its streamer.
//   render     { id, start, end, title }  the clipper, or the streamer for a highlight.
//   posted     { id, postTokenId }        the same, once the Short exists.
//   dismiss    { id }                     the streamer, on a highlight.
//   highlights { tokenId }                the streamer: detect and cut.
//   complete   { secret, kind, clipId, jobId, ok, … }   the worker.
//
// Without a worker URL and secret, live capture and rendering say so and stop.
import { admin, corsHeaders, DEHUB_API_BASE, json } from '../_shared/transcripts.ts';
import { checkRateLimit, requireDeHubAuth } from '../_shared/auth.ts';
import { buildAss } from '../stage-clips/highlights.ts';
import { findSpikes, liveSpike, type StreamEvent } from './spikes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const BUCKET = 'live-clips';
const LOG = '[live-clips]';
const MEDIAMTX_HOST = Deno.env.get('MEDIAMTX_PUBLIC_HOST') || 'live.dehub.io';
/** How far back a viewer's clip reaches, and how far a replay clip may run on. */
const LOOKBACK_S = 60;
const LOOKAHEAD_S = 15;
const DEFAULT_CLIP_S = 30;
const MIN_CLIP_S = 3;
const MAX_CLIP_S = 60;
/** A grab or render with no callback after this long may be asked for again. */
const STALE_JOB_MS = 10 * 60 * 1000;
/** No two live highlights closer than this. */
const LIVE_HIGHLIGHT_GAP_S = 120;

const COLUMNS = 'id, short_id, kind, status, stream_token_id, stream_id, stream_title, streamer_address, streamer_username, '
  + 'clipper_address, clipper_username, source_kind, source_url, window_start, window_end, broadcast_offset, start_seconds, '
  + 'end_seconds, title, score, reason, job_id, attempts, error, video_url, poster_url, card_url, duration_seconds, '
  + 'post_token_id, posted_at, created_at, updated_at';

/* ───────────────────────────────── worker ───────────────────────────────── */

type WorkerConfig = { url: string; secret: string; configured: boolean };

/** Same host and secret as the dub worker; its route sits next to /jobs. LIVE_CLIP_WORKER_URL overrides. */
async function workerConfig(db: any): Promise<WorkerConfig> {
  const { data } = await db.from('video_dub_worker').select('worker_url, secret').eq('id', 1).maybeSingle();
  const explicit = Deno.env.get('LIVE_CLIP_WORKER_URL') ?? '';
  const dub = Deno.env.get('DUB_WORKER_URL') || data?.worker_url || '';
  const derived = /\/jobs\/?$/.test(dub) ? dub.replace(/\/jobs\/?$/, '/live-clips') : '';
  const url = [explicit, derived].find((u) => u.startsWith('https://')) ?? '';
  const secret = Deno.env.get('DUB_WORKER_SECRET') || data?.secret || '';
  return { url, secret, configured: !!url && !!secret };
}

async function sendToWorker(worker: WorkerConfig, input: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(worker.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker.secret}` },
      body: JSON.stringify({ input: { ...input, callbackUrl: `${SUPABASE_URL}/functions/v1/live-clips` } }),
      signal: AbortSignal.timeout(15000),
    });
    await res.body?.cancel();
    if (res.ok) return null;
    return res.status === 503 ? 'Clipping is busy right now. Try again in a minute.' : `clip worker ${res.status}`;
  } catch {
    return 'Clipping is unavailable right now.';
  }
}

const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
const base = (row: { stream_token_id: number | string; id: string }) => `${row.stream_token_id}/${row.id}`;

async function signedUpload(db: any, path: string): Promise<string | null> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) {
    console.error(`${LOG} signed upload url failed`, error);
    return null;
  }
  return data.signedUrl;
}

/* ───────────────────────────────── stream ───────────────────────────────── */

interface StreamPost {
  tokenId: number;
  title: string;
  streamer: string;
  streamerName: string | null;
  streamId: string | null;
  live: boolean;
  startedAt: number | null;
  durationS: number;
  hlsUrl: string | null;
  recordingUrl: string | null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The live post, if it may be clipped: public, not sold per view or gated, not
 * hidden or adult. Anything a clip would leak past a paywall is refused.
 */
async function streamPost(tokenId: number): Promise<{ post?: StreamPost; error?: string }> {
  const body = await fetchJson(`${DEHUB_API_BASE}/api/nft_info/${tokenId}`);
  const p = body?.result ?? body;
  if (!p?.tokenId) return { error: 'Stream not found.' };
  if (p.postType !== 'live' || !p.stream) return { error: 'Only live streams can be clipped.' };
  const info = p.streamInfo ?? {};
  const rating = String(p.contentRating ?? '').toLowerCase();
  const gated = p.isHidden === true || rating === 'blocked' || rating === 'mature' || Number(p.price ?? 0) > 0
    || info.isPayPerView || info.isLockContent || (Array.isArray(p.plansDetails) && p.plansDetails.length > 0)
    || (Array.isArray(p.plans) && p.plans.length > 0);
  if (gated) return { error: 'This stream cannot be clipped.' };

  const s = p.stream;
  const live = String(s.status ?? '').toUpperCase() === 'LIVE';
  const startedAt = s.startedAt ? Date.parse(s.startedAt) : NaN;
  const playbackId = typeof s.playbackId === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(s.playbackId) ? s.playbackId : null;
  const hlsUrl = !playbackId ? null : s.provider === 'mediamtx'
    ? `https://${MEDIAMTX_HOST}/${playbackId}-aac/index.m3u8`
    : `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
  const rec = s.recording;
  const recordingUrl = rec?.status === 'ready' && typeof rec.url === 'string' && rec.url.startsWith('https://') ? rec.url : null;
  const durationS = Number(rec?.durationSec ?? s.duration ?? 0) || 0;
  return {
    post: {
      tokenId: Number(p.tokenId),
      title: String(p.name ?? '').trim().slice(0, 120),
      streamer: String(p.minter ?? '').toLowerCase(),
      streamerName: p.mintername || p.minterUser?.username || p.minterDisplayName || null,
      streamId: s._id ? String(s._id) : null,
      live,
      startedAt: Number.isFinite(startedAt) ? startedAt : null,
      durationS,
      hlsUrl,
      recordingUrl,
    },
  };
}

async function usernameOf(wallet: string): Promise<string | null> {
  const body = await fetchJson(`${DEHUB_API_BASE}/api/account_info/${encodeURIComponent(wallet)}`);
  const a = body?.result ?? body;
  return a?.username || a?.displayName || null;
}

/* ───────────────────────────────── events ───────────────────────────────── */

const MAX_PAGES = 30;

/** Chat, reactions and gifts since the broadcast started, as seconds into it. */
async function streamEvents(post: StreamPost, sinceMs: number): Promise<StreamEvent[]> {
  const startedAt = post.startedAt!;
  const events: StreamEvent[] = [];
  const at = (iso: string) => (Date.parse(iso) - startedAt) / 1000;

  let before = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ roomId: `stream:${post.tokenId}`, limit: '100', ...(before ? { before } : {}) });
    const body = await fetchJson(`${DEHUB_API_BASE}/api/livechat/messages?${q}`);
    const messages: any[] = body?.messages ?? body?.result?.messages ?? [];
    if (!messages.length) break;
    let older = false;
    for (const m of messages) {
      const t = Date.parse(m.createdAt);
      if (!Number.isFinite(t) || t < sinceMs) { older = true; continue; }
      events.push({ t: at(m.createdAt), kind: 'chat' });
    }
    before = String(messages[messages.length - 1]?.id ?? '');
    if (older || !body?.hasMore || !before) break;
  }

  if (post.streamId) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ limit: '200', skip: String(page * 200), order: 'desc' });
      const body = await fetchJson(`${DEHUB_API_BASE}/api/live/${encodeURIComponent(post.streamId)}/activities?${q}`);
      const rows: any[] = Array.isArray(body) ? body : body?.result ?? [];
      if (!rows.length) break;
      let older = false;
      for (const r of rows) {
        const t = Date.parse(r.createdAt);
        if (!Number.isFinite(t) || t < sinceMs) { older = true; continue; }
        if (r.status === 'TIP') events.push({ t: at(r.createdAt), kind: 'gift', amount: Number(r.meta?.amount) || 0 });
        else if (r.status === 'REACTION' || r.status === 'LIKE') events.push({ t: at(r.createdAt), kind: 'reaction' });
      }
      if (older || rows.length < 200) break;
    }
  }
  return events;
}

/* ───────────────────────────────── shapes ───────────────────────────────── */

function view(row: any) {
  return {
    id: row.id,
    shortId: Number(row.short_id),
    kind: row.kind,
    status: row.status,
    streamTokenId: Number(row.stream_token_id),
    streamTitle: row.stream_title,
    streamerAddress: row.streamer_address,
    streamerUsername: row.streamer_username,
    clipperAddress: row.clipper_address,
    clipperUsername: row.clipper_username,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    windowStart: Number(row.window_start),
    windowEnd: Number(row.window_end),
    broadcastOffset: row.broadcast_offset == null ? null : Number(row.broadcast_offset),
    start: row.start_seconds == null ? null : Number(row.start_seconds),
    end: row.end_seconds == null ? null : Number(row.end_seconds),
    title: row.title,
    score: row.score == null ? null : Number(row.score),
    reason: row.reason,
    error: row.error,
    videoUrl: row.video_url,
    posterUrl: row.poster_url,
    cardUrl: row.card_url,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    postTokenId: row.post_token_id == null ? null : Number(row.post_token_id),
    postedAt: row.posted_at,
    createdAt: row.created_at,
  };
}

async function loadClip(db: any, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('live_clips').select(COLUMNS).eq('id', id).maybeSingle();
  return data ?? null;
}

const now = () => new Date().toISOString();
const tokenIdOf = (v: unknown) => (/^\d{1,15}$/.test(String(v ?? '')) ? Number(v) : null);
const round = (n: number) => Math.round(n * 100) / 100;

/** Who may edit a clip: its clipper, or for a highlight the streamer. */
const owns = (row: any, wallet: string) => (row.kind === 'highlight' ? row.streamer_address : row.clipper_address) === wallet;

/* ──────────────────────────────── capture ───────────────────────────────── */

async function dispatchGrab(db: any, worker: WorkerConfig, row: any, post: StreamPost, seconds: number): Promise<string | null> {
  const jobId = crypto.randomUUID();
  const path = `${base(row)}/${jobId}-source.mp4`;
  const uploadUrl = await signedUpload(db, path);
  if (!uploadUrl) return 'Could not prepare the clip.';
  await db.from('live_clips').update({ job_id: jobId, attempts: (row.attempts ?? 0) + 1, updated_at: now() }).eq('id', row.id);
  return await sendToWorker(worker, {
    kind: 'grab', clipId: row.id, jobId, hlsUrl: post.hlsUrl, maxSeconds: seconds, uploadUrl, path,
  });
}

async function capture(db: any, wallet: string, body: any) {
  const tokenId = tokenIdOf(body?.tokenId);
  if (tokenId == null) return json({ error: 'tokenId required' }, 400);
  const limit = await checkRateLimit(db, wallet, 'live-clip-capture', { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return json({ error: 'You have made a lot of clips. Try again later.' }, 429);

  const { post, error } = await streamPost(tokenId);
  if (!post) return json({ error }, 409);
  const clipperUsername = await usernameOf(wallet);
  const baseRow = {
    kind: 'viewer',
    stream_token_id: post.tokenId,
    stream_id: post.streamId,
    stream_title: post.title,
    streamer_address: post.streamer,
    streamer_username: post.streamerName,
    clipper_address: wallet,
    clipper_username: clipperUsername,
    title: post.title,
  };

  if (post.live) {
    if (!post.hlsUrl) return json({ error: 'This stream cannot be clipped yet.' }, 409);
    const worker = await workerConfig(db);
    if (!worker.configured) return json({ error: 'Clipping is not switched on yet.' }, 503);
    const offset = post.startedAt ? Math.max(0, (Date.now() - post.startedAt) / 1000) : null;
    const { data: row, error: insertError } = await db.from('live_clips').insert({
      ...baseRow, status: 'capturing', source_kind: 'live', broadcast_offset: offset,
    }).select(COLUMNS).single();
    if (insertError) throw insertError;
    const failed = await dispatchGrab(db, worker, row, post, LOOKBACK_S);
    if (failed) {
      await db.from('live_clips').update({ status: 'failed', error: failed, updated_at: now() }).eq('id', row.id);
      return json({ error: failed }, 503);
    }
    return json({ clip: view(row) });
  }

  // Ended: clip the replay around where the viewer is watching.
  if (!post.recordingUrl) return json({ error: 'The replay is not ready yet.' }, 409);
  const duration = post.durationS > 0 ? post.durationS : Number.POSITIVE_INFINITY;
  const at = Math.min(duration, Math.max(0, Number(body?.at) || 0));
  const windowStart = Math.max(0, at - LOOKBACK_S);
  const windowEnd = Math.min(duration, at + LOOKAHEAD_S);
  let start = Math.max(windowStart, at - DEFAULT_CLIP_S);
  let end = at;
  if (end - start < MIN_CLIP_S) {
    start = windowStart;
    end = Math.min(windowEnd, start + DEFAULT_CLIP_S);
  }
  if (end - start < MIN_CLIP_S) return json({ error: 'The replay is too short to clip here.' }, 409);
  const { data: row, error: insertError } = await db.from('live_clips').insert({
    ...baseRow, status: 'draft', source_kind: 'replay', source_url: post.recordingUrl,
    window_start: round(windowStart), window_end: round(Number.isFinite(windowEnd) ? windowEnd : at + LOOKAHEAD_S),
    broadcast_offset: round(at), start_seconds: round(start), end_seconds: round(end),
  }).select(COLUMNS).single();
  if (insertError) throw insertError;
  return json({ clip: view(row) });
}

/* ──────────────────────────────── render ────────────────────────────────── */

async function render(db: any, wallet: string, body: any) {
  const row = await loadClip(db, body?.id);
  if (!row) return json({ error: 'Clip not found.' }, 404);
  if (!owns(row, wallet)) return json({ error: 'forbidden' }, 403);
  const stale = row.status === 'rendering' && Date.now() - Date.parse(row.updated_at) > STALE_JOB_MS;
  if (row.status !== 'draft' && !stale) return json({ error: `Clip is ${row.status}.` }, 409);
  if (!row.source_url) return json({ error: 'Clip has no source yet.' }, 409);

  const start = Number(body?.start);
  const end = Number(body?.end);
  const windowStart = Number(row.window_start);
  const windowEnd = Number(row.window_end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return json({ error: 'start and end required' }, 400);
  if (start < windowStart - 0.05 || end > windowEnd + 0.05) return json({ error: 'Pick a stretch inside the clip.' }, 400);
  if (end - start < MIN_CLIP_S || end - start > MAX_CLIP_S) return json({ error: `Clips run ${MIN_CLIP_S}-${MAX_CLIP_S} seconds.` }, 400);
  const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || row.title || 'Live clip';

  const limit = await checkRateLimit(db, wallet, 'live-clip-render', { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return json({ error: 'Too many clips at once. Try again later.' }, 429);
  const worker = await workerConfig(db);
  if (!worker.configured) return json({ error: 'Clipping is not switched on yet.' }, 503);

  const jobId = crypto.randomUUID();
  const dir = `${base(row)}/${jobId}`;
  const paths = { video: `${dir}.mp4`, poster: `${dir}-poster.jpg`, card: `${dir}-card.jpg` };
  const uploads: Record<string, { url: string; path: string }> = {};
  for (const [k, path] of Object.entries(paths)) {
    const url = await signedUpload(db, path);
    if (!url) return json({ error: 'Could not prepare the clip.' }, 500);
    uploads[k] = { url, path };
  }

  // Compare-and-set so two taps cannot render twice.
  const { data: claimed } = await db.from('live_clips').update({
    status: 'rendering', job_id: jobId, attempts: row.attempts + 1, start_seconds: round(start), end_seconds: round(end),
    title, error: null, updated_at: now(),
  }).eq('id', row.id).eq('status', row.status).eq('attempts', row.attempts).select(COLUMNS);
  if (!claimed?.length) return json({ error: 'Clip is already being made.' }, 409);

  const streamer = row.streamer_username ? `@${row.streamer_username}` : 'the stream';
  const ass = buildAss([], end - start, {
    title: `Watch ${streamer} live`,
    url: `dehub.io/clip/${row.short_id}`,
    host: row.streamer_username ? `@${row.streamer_username}` : undefined,
  });
  const failed = await sendToWorker(worker, {
    kind: 'render', clipId: row.id, jobId, sourceUrl: row.source_url, start, end, ass, uploads,
  });
  if (failed) {
    await db.from('live_clips').update({ status: 'draft', error: failed, updated_at: now() })
      .eq('id', row.id).eq('job_id', jobId);
    return json({ error: failed }, 503);
  }
  return json({ clip: view(claimed[0]) });
}

/* ──────────────────────────────── posted ────────────────────────────────── */

async function posted(db: any, wallet: string, body: any) {
  const row = await loadClip(db, body?.id);
  if (!row) return json({ error: 'Clip not found.' }, 404);
  if (!owns(row, wallet)) return json({ error: 'forbidden' }, 403);
  const postTokenId = tokenIdOf(body?.postTokenId);
  if (postTokenId == null) return json({ error: 'postTokenId required' }, 400);
  if (row.status === 'posted') return json({ clip: view(row) });
  if (row.status !== 'ready') return json({ error: `Clip is ${row.status}.` }, 409);

  // The Short must be the caller's own, or anyone could pin a clip to any post.
  const p = await fetchJson(`${DEHUB_API_BASE}/api/nft_info/${postTokenId}`);
  const minter = String((p?.result ?? p)?.minter ?? '').toLowerCase();
  if (minter && minter !== wallet) return json({ error: 'That post is not yours.' }, 403);

  const { data } = await db.from('live_clips').update({
    status: 'posted', post_token_id: postTokenId, posted_at: now(), updated_at: now(),
  }).eq('id', row.id).eq('status', 'ready').select(COLUMNS);
  return json({ clip: view(data?.[0] ?? row) });
}

async function dismiss(db: any, wallet: string, body: any) {
  const row = await loadClip(db, body?.id);
  if (!row) return json({ error: 'Clip not found.' }, 404);
  if (row.kind !== 'highlight' || row.streamer_address !== wallet) return json({ error: 'forbidden' }, 403);
  if (!['draft', 'failed', 'capturing'].includes(row.status)) return json({ error: `Clip is ${row.status}.` }, 409);
  await db.from('live_clips').update({ status: 'dismissed', updated_at: now() }).eq('id', row.id);
  return json({ ok: true });
}

/* ─────────────────────────────── highlights ─────────────────────────────── */

async function insertHighlight(db: any, row: Record<string, unknown>) {
  const { data, error } = await db.from('live_clips').insert(row).select(COLUMNS).maybeSingle();
  // The moment is already cut (the unique index on its half-minute).
  if (error?.code === '23505') return null;
  if (error) throw error;
  return data;
}

async function highlights(db: any, wallet: string, body: any) {
  const tokenId = tokenIdOf(body?.tokenId);
  if (tokenId == null) return json({ error: 'tokenId required' }, 400);
  const { post, error } = await streamPost(tokenId);
  if (!post) return json({ error }, 409);
  if (post.streamer !== wallet) return json({ error: 'forbidden' }, 403);
  if (!post.startedAt) return json({ ok: true, created: 0, skipped: 'stream has not started' });
  const limit = await checkRateLimit(db, wallet, 'live-clip-highlights', { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return json({ ok: true, created: 0, skipped: 'rate limited' });

  const baseRow = {
    kind: 'highlight',
    stream_token_id: post.tokenId,
    stream_id: post.streamId,
    stream_title: post.title,
    streamer_address: post.streamer,
    streamer_username: post.streamerName,
  };

  if (post.live) {
    const nowS = (Date.now() - post.startedAt) / 1000;
    const { data: recent } = await db.from('live_clips').select('broadcast_offset')
      .eq('stream_token_id', post.tokenId).eq('kind', 'highlight').eq('source_kind', 'live')
      .gte('broadcast_offset', nowS - LIVE_HIGHLIGHT_GAP_S).limit(1);
    if (recent?.length) return json({ ok: true, created: 0 });
    const spike = liveSpike(await streamEvents(post, post.startedAt), nowS);
    if (!spike) return json({ ok: true, created: 0 });
    const worker = await workerConfig(db);
    if (!worker.configured || !post.hlsUrl) return json({ ok: true, created: 0, skipped: 'worker not configured' });
    const row = await insertHighlight(db, {
      ...baseRow, status: 'capturing', source_kind: 'live', broadcast_offset: round(spike.at),
      score: spike.score, reason: spike.reason, title: post.title,
    });
    if (!row) return json({ ok: true, created: 0 });
    const failed = await dispatchGrab(db, worker, row, post, 75);
    if (failed) await db.from('live_clips').update({ status: 'failed', error: failed, updated_at: now() }).eq('id', row.id);
    return json({ ok: true, created: failed ? 0 : 1 });
  }

  // Ended: one pass over the whole broadcast, cut from the replay.
  if (!post.recordingUrl || post.durationS <= 0) return json({ ok: true, created: 0, skipped: 'replay not ready' });
  const { count } = await db.from('live_clips').select('id', { count: 'exact', head: true })
    .eq('stream_token_id', post.tokenId).eq('kind', 'highlight').eq('source_kind', 'replay');
  if ((count ?? 0) > 0) return json({ ok: true, created: 0 });
  const spikes = findSpikes(await streamEvents(post, post.startedAt), post.durationS);
  let created = 0;
  for (const s of spikes) {
    if (s.end - s.start < MIN_CLIP_S) continue;
    const row = await insertHighlight(db, {
      ...baseRow, status: 'draft', source_kind: 'replay', source_url: post.recordingUrl,
      window_start: round(s.windowStart), window_end: round(s.windowEnd), broadcast_offset: round(s.at),
      start_seconds: round(s.start), end_seconds: round(Math.min(s.end, s.start + MAX_CLIP_S)),
      score: s.score, reason: s.reason, title: post.title,
    });
    if (row) created++;
  }
  return json({ ok: true, created });
}

/* ──────────────────────────────── reading ───────────────────────────────── */

async function list(db: any, req: Request, body: any) {
  const tokenId = tokenIdOf(body?.tokenId);
  if (tokenId == null) return json({ error: 'tokenId required' }, 400);
  let wallet: string | null = null;
  if (req.headers.get('x-dehub-token')) {
    const auth = await requireDeHubAuth(req);
    if (auth.ok) wallet = auth.wallet;
  }
  const { data: rows } = await db.from('live_clips').select(COLUMNS).eq('stream_token_id', tokenId)
    .order('created_at', { ascending: false }).limit(100);
  const all = rows ?? [];
  const streamer = all[0]?.streamer_address;
  const visible = all.filter((r: any) => r.status === 'posted'
    || (wallet && wallet === streamer && r.status !== 'dismissed')
    || (wallet && r.clipper_address === wallet && r.status !== 'dismissed'));
  return json({ clips: visible.map(view) });
}

/* ─────────────────────────────── complete ───────────────────────────────── */

async function complete(db: any, body: any) {
  const worker = await workerConfig(db);
  if (!worker.secret || typeof body?.secret !== 'string' || body.secret !== worker.secret) return json({ error: 'forbidden' }, 403);
  const row = await loadClip(db, body?.clipId);
  const jobId = String(body?.jobId ?? '');
  if (!row || !jobId || row.job_id !== jobId) return json({ ok: true, ignored: true });

  if (body?.kind === 'grab') {
    if (row.status !== 'capturing') return json({ ok: true, ignored: true });
    const path = `${base(row)}/${jobId}-source.mp4`;
    const duration = Number(body?.durationSeconds);
    if (body?.ok === true && body?.path === path && Number.isFinite(duration) && duration >= MIN_CLIP_S) {
      // The newest stretch by default: what the viewer just saw, or the spike.
      const length = row.kind === 'highlight' ? 45 : DEFAULT_CLIP_S;
      await db.from('live_clips').update({
        status: 'draft', source_url: publicUrl(path), window_start: 0, window_end: round(duration),
        start_seconds: round(Math.max(0, duration - length)), end_seconds: round(duration), error: null, updated_at: now(),
      }).eq('id', row.id).eq('job_id', jobId).eq('status', 'capturing');
    } else {
      await db.from('live_clips').update({
        status: 'failed', error: String(body?.error ?? 'Could not grab the stream.').slice(0, 500), updated_at: now(),
      }).eq('id', row.id).eq('job_id', jobId).eq('status', 'capturing');
    }
    return json({ ok: true });
  }

  if (body?.kind === 'render') {
    if (row.status !== 'rendering') return json({ ok: true, ignored: true });
    const dir = `${base(row)}/${jobId}`;
    const want = { video: `${dir}.mp4`, poster: `${dir}-poster.jpg`, card: `${dir}-card.jpg` };
    const paths = body?.paths ?? {};
    if (body?.ok === true && Object.entries(want).every(([k, p]) => paths[k] === p)) {
      const duration = Number(body?.durationSeconds);
      await db.from('live_clips').update({
        status: 'ready', video_url: publicUrl(want.video), poster_url: publicUrl(want.poster), card_url: publicUrl(want.card),
        duration_seconds: Number.isFinite(duration) ? duration : null, error: null, updated_at: now(),
      }).eq('id', row.id).eq('job_id', jobId).eq('status', 'rendering');
    } else {
      // Back to the editor, so the clipper can try again.
      await db.from('live_clips').update({
        status: 'draft', error: String(body?.error ?? 'Could not make the clip.').slice(0, 500), updated_at: now(),
      }).eq('id', row.id).eq('job_id', jobId).eq('status', 'rendering');
    }
    return json({ ok: true });
  }
  return json({ error: 'unknown kind' }, 400);
}

/* ─────────────────────────────── handler ────────────────────────────────── */

const SIGNED_IN: Record<string, (db: any, wallet: string, body: any) => Promise<Response>> = {
  capture, render, posted, dismiss, highlights,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const action = String(body?.action ?? '');
    if (action === 'complete') return await complete(db, body);
    if (action === 'get') {
      const row = await loadClip(db, body?.id);
      return row && row.status !== 'dismissed' ? json({ clip: view(row) }) : json({ error: 'Clip not found.' }, 404);
    }
    if (action === 'list') return await list(db, req, body);
    const handler = SIGNED_IN[action];
    if (!handler) return json({ error: 'unknown action' }, 400);
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    return await handler(db, auth.wallet, body);
  } catch (e: any) {
    console.error(`${LOG} error`, e);
    return json({ error: 'Something went wrong with this clip.' }, 500);
  }
});
