// Shared vocabulary for the transcript stack.
//
// Everything DeHub transcribes — a video post, an ended stage, an ended live
// room, an audio post — lands in `public.transcripts` keyed on
// (source_kind, source_ref). This module owns the parts that used to be
// duplicated per-caller: how a request names its target, how a language code
// is spelled, how a media URL is found, and how segments become WebVTT.

// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * The DeHub REST API, ORIGIN ONLY — paths below add their own `/api`.
 *
 * Deliberately not `DEHUB_API_BASE`: that secret is already set on this
 * project to `https://api.dehub.io/api`, because `assistant-agent.ts` appends
 * bare paths like `/assistant/tools` to it. Reading it here produced
 * `/api/api/nft_info/…`, which 404s — so every post lookup answered "post not
 * found" and the sweeper's feed pass came back empty.
 *
 * A trailing slash or a trailing `/api` on the override is stripped rather
 * than trusted, because that is the exact mistake this comment exists about.
 */
export const DEHUB_API_BASE = (Deno.env.get('DEHUB_PUBLIC_API_BASE') || 'https://api.dehub.io')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
export const DEHUB_CDN_BASE = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';

export type SourceKind = 'video' | 'stage' | 'live' | 'audio';
export type TranscriptStatus = 'pending' | 'processing' | 'ready' | 'empty' | 'failed';
export type Visibility = 'public' | 'members' | 'private';

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptRow {
  id: string;
  source_kind: SourceKind;
  source_ref: string;
  status: TranscriptStatus;
  provider: string | null;
  model: string | null;
  source_lang: string | null;
  duration_seconds: number | null;
  segments: Segment[];
  full_text: string | null;
  vtt: string | null;
  summary: string | null;
  summary_status: string;
  chapters: unknown[];
  speaker_map: Record<string, unknown>;
  speaker_timeline: unknown[];
  speaker_overrides: Record<string, unknown>;
  visibility: Visibility;
  attempts: number;
  last_attempt_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns worth sending to a browser. Deliberately not `*`: `vtt` and the
 *  segment array are large, and a status poll asked for them every 3 seconds. */
export const STATUS_COLUMNS =
  'id, source_kind, source_ref, status, source_lang, duration_seconds, ' +
  'summary, summary_status, visibility, attempts, error, created_at, updated_at';

export const FULL_COLUMNS = `${STATUS_COLUMNS}, provider, model, segments, full_text, vtt, chapters, speaker_map, speaker_timeline, speaker_overrides`;

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/* ───────────────────────────── target parsing ───────────────────────────── */

export interface Target {
  kind: SourceKind;
  ref: string;
}

const KINDS: SourceKind[] = ['video', 'stage', 'live', 'audio'];

/**
 * Read the target out of a request body.
 *
 * The new shape is `{ kind, ref }`. The two shapes that shipped before it —
 * `{ tokenId }` from the video subtitle overlay and `{ stageId }` from the
 * stage drawer — are still accepted, because a browser holding a cached bundle
 * and a mobile build that has not been rebuilt both still send them.
 */
export function parseTarget(body: any): Target | null {
  const kind = String(body?.kind ?? '').toLowerCase();
  if (KINDS.includes(kind as SourceKind)) {
    const ref = String(body?.ref ?? '').trim();
    if (!ref) return null;
    return normalizeTarget({ kind: kind as SourceKind, ref });
  }
  if (body?.stageId) return normalizeTarget({ kind: 'stage', ref: String(body.stageId).trim() });
  if (body?.tokenId !== undefined && body?.tokenId !== null) {
    return normalizeTarget({ kind: 'video', ref: String(body.tokenId).trim() });
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refuse a shape that can never resolve, before it costs an upstream call. */
export function normalizeTarget(t: Target): Target | null {
  if (t.kind === 'stage') {
    return UUID_RE.test(t.ref) ? { kind: 'stage', ref: t.ref.toLowerCase() } : null;
  }
  const n = Number(t.ref);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
  return { kind: t.kind, ref: String(n) };
}

/* ──────────────────────────── language codes ────────────────────────────── */

/** ElevenLabs Scribe answers in three letters, Deepgram in `en-US`. The picker,
 *  the translator and the "is this already the target language" check all speak
 *  two, so everything is normalised the moment it arrives. */
const THREE_TO_TWO: Record<string, string> = {
  eng: 'en', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de',
  ita: 'it', por: 'pt', rus: 'ru', tur: 'tr', jpn: 'ja', kor: 'ko',
  zho: 'zh', chi: 'zh', ara: 'ar', hin: 'hi', ind: 'id', nld: 'nl',
  dut: 'nl', pol: 'pl', ukr: 'uk', heb: 'he', fas: 'fa', per: 'fa',
  ben: 'bn', urd: 'ur', msa: 'ms', may: 'ms', tha: 'th', vie: 'vi',
  tgl: 'tl', fil: 'tl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi',
  ces: 'cs', cze: 'cs', ell: 'el', gre: 'el', ron: 'ro', rum: 'ro',
  hun: 'hu',
};

export function normalizeLang(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  // Traditional Chinese is the one distinction worth keeping past two letters.
  if (v.startsWith('zh-tw') || v.startsWith('zh-hant') || v.startsWith('zh-hk')) return 'zh-TW';
  const base = v.split(/[-_]/)[0];
  if (base.length === 3 && THREE_TO_TWO[base]) return THREE_TO_TWO[base];
  if (base.length === 2) return base;
  return THREE_TO_TWO[base] ?? null;
}

/* ─────────────────────────────── WebVTT ─────────────────────────────────── */

function vttTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}.${pad(ms, 3)}`;
}

export function buildVtt(segments: Segment[]): string {
  const lines: string[] = ['WEBVTT', ''];
  segments.forEach((s, i) => {
    if (!s.text) return;
    lines.push(String(i + 1));
    lines.push(`${vttTime(s.start)} --> ${vttTime(s.end > s.start ? s.end : s.start + 2)}`);
    lines.push(s.speaker ? `<v ${s.speaker}>${s.text}` : s.text);
    lines.push('');
  });
  return lines.join('\n');
}

/* ────────────────────────── media resolution ────────────────────────────── */

export interface ResolvedMedia {
  url: string;
  visibility: Visibility;
  durationSeconds: number | null;
  /** Set when the source exists but is not transcribable yet — the sweeper
   *  should come back rather than burn an attempt. */
  notReady?: string;
}

export class TargetError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function mediaUrl(relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  return DEHUB_CDN_BASE + relative.replace(/^\/+/, '');
}

/**
 * A post's transcript is exactly as reachable as the post. Hidden and blocked
 * posts go private, mature goes members-only, and a paid post's words are the
 * thing being sold — before this the full text of all three sat in a
 * world-readable table.
 */
function visibilityForPost(post: any): Visibility {
  if (post?.isHidden === true) return 'private';
  const rating = String(post?.contentRating ?? '').toLowerCase();
  if (rating === 'blocked') return 'private';
  if (Number(post?.price ?? 0) > 0) return 'private';
  if (rating === 'mature') return 'members';
  return 'public';
}

async function fetchPost(tokenId: string): Promise<any> {
  const url = `${DEHUB_API_BASE}/api/nft_info/${tokenId}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  // Name the URL. A misconfigured base answers 404 for every post, which is
  // indistinguishable from "that post does not exist" unless the message says
  // where it looked.
  if (res.status === 404) throw new TargetError(404, `post not found (${url})`);
  if (!res.ok) throw new TargetError(502, `nft_info ${res.status} (${url})`);
  const body = await res.json();
  const post = body?.result ?? body;
  if (!post || !post.tokenId) throw new TargetError(404, `post not found (${url})`);
  return post;
}

/**
 * Find the bytes to transcribe.
 *
 * The video path used to build `videos/{tokenId}.mp4` by hand and hope. It
 * addressed nothing else — audio posts and ended live rooms were unreachable
 * by construction — and it could not tell "this post does not exist" from
 * "this post is still transcoding", so a request made seconds after upload
 * failed permanently on the CDN's 403.
 */
export async function resolveMedia(
  target: Target,
  db: SupabaseClient,
): Promise<ResolvedMedia> {
  if (target.kind === 'stage') {
    const { data: stage, error } = await db
      .from('audio_spaces')
      .select('id, status, recording_url, host_wallet_address')
      .eq('id', target.ref)
      .maybeSingle();
    if (error) throw new TargetError(500, error.message);
    if (!stage) throw new TargetError(404, 'stage not found');
    if (stage.status !== 'ended') return { url: '', visibility: 'public', durationSeconds: null, notReady: 'stage has not ended' };
    if (!stage.recording_url) throw new TargetError(409, 'stage has no recording');
    return { url: stage.recording_url, visibility: 'public', durationSeconds: null };
  }

  // A post lookup that fails for any reason other than "no such post" is a
  // wait, not a verdict. Guessing the CDN path and carrying on would be worse
  // than useless here: `visibility` comes from the post, so a transcript
  // written without it would default to public and republish the words of a
  // paid or mature one.
  let post: any;
  try {
    post = await fetchPost(target.ref);
  } catch (e) {
    if (e instanceof TargetError && e.status !== 404) {
      return { url: '', visibility: 'private', durationSeconds: null, notReady: e.message };
    }
    throw e;
  }
  const visibility = visibilityForPost(post);
  const duration = Number(post?.videoDuration ?? post?.audioDuration ?? 0) || null;

  if (target.kind === 'audio') {
    const rel = post?.audioUrl || post?.videoUrl;
    if (!rel) throw new TargetError(409, 'post has no audio');
    return { url: mediaUrl(String(rel)), visibility, durationSeconds: duration };
  }

  // video and the recording an ended live room leaves behind
  const rel = post?.videoUrl;
  if (!rel) {
    return { url: '', visibility, durationSeconds: duration, notReady: 'post has no video yet' };
  }
  const transcoding = String(post?.transcodingStatus ?? '').toLowerCase();
  if (transcoding && transcoding !== 'done' && transcoding !== 'completed') {
    return { url: '', visibility, durationSeconds: duration, notReady: `transcoding ${transcoding}` };
  }
  return { url: mediaUrl(String(rel)), visibility, durationSeconds: duration };
}

/** A media URL that answers 403/404 usually means the upload has not landed
 *  yet rather than that it never will, so it is worth one cheap look before
 *  handing the job to a paid transcriber. */
export async function mediaIsReachable(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
    // Drain so the connection is not left half-open.
    await res.arrayBuffer().catch(() => undefined);
    return { ok: res.ok || res.status === 206, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/* ───────────────────────────── retry policy ─────────────────────────────── */

export const MAX_ATTEMPTS = 5;
/** A job that claimed the row and never came back. Supabase can tear an isolate
 *  down mid-run, and the catch that would have written 'failed' never fires. */
export const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** Backoff between attempts: 2 min, 8, 30, 2 h. */
export function retryDelayMs(attempts: number): number {
  const mins = [2, 8, 30, 120, 120];
  return (mins[Math.min(attempts, mins.length - 1)] ?? 120) * 60 * 1000;
}

/**
 * How long to leave a row that is waiting on media alone.
 *
 * A 'pending' row deliberately does not burn an attempt — waiting for a
 * transcode is not a failed try. But that left `attempts` at 0 forever, so
 * `retryDelayMs(0)` re-queued every waiting row every two minutes, for good.
 * Ten posts whose transcoding had genuinely failed were taking ten of the
 * sweeper's twelve slots on every pass and would have done so for ever.
 *
 * So a waiting row backs off on its own age instead: minutes at first, because
 * a fresh upload really is about to land, then hours, and after a day it stops
 * being asked about at all. A post that has said "transcoding failed" for an
 * hour is not going to fix itself in the next two minutes.
 */
export const WAIT_GIVE_UP_MS = 24 * 60 * 60 * 1000;

export function waitDelayMs(ageMs: number): number {
  if (ageMs < 10 * 60 * 1000) return 2 * 60 * 1000;   // first 10 min: every 2
  if (ageMs < 60 * 60 * 1000) return 15 * 60 * 1000;  // first hour: every 15
  return 4 * 60 * 60 * 1000;                          // after that: every 4 h
}

export function isRetryable(row: {
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  created_at?: string | null;
}): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const last = row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
  const since = Date.now() - last;

  if (row.status === 'processing') return since > STALE_PROCESSING_MS;

  if (row.status === 'pending') {
    const born = row.created_at ? Date.parse(row.created_at) : Date.now();
    const age = Date.now() - born;
    if (age > WAIT_GIVE_UP_MS) return false;
    return since > waitDelayMs(age);
  }

  if (row.status === 'failed') return since > retryDelayMs(row.attempts);
  return false;
}
