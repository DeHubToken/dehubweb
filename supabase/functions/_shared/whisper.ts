// deno-lint-ignore-file no-explicit-any
// Self-hosted Whisper (services/whisper), the first engine for every transcript.
//
// The worker is asynchronous. `transcribe` hands it a job and returns; the
// worker posts the result back to `transcribe` with the shared secret and the
// job id, and only the job the row is still waiting for may write it. The paid
// engines are the fallback for a worker that is down, full, or never answers.
//
// Pure on purpose: no Deno, no database client, so it runs under node's test
// runner in CI like transcription-fallback.ts.

/** A job not started by then is no longer wanted: the worker reports it
 *  expired instead of spending minutes on it, and the caller falls back. */
export const WHISPER_START_WITHIN_MS = 10 * 60 * 1000;
/** RunPod's own ceiling on one execution; past it the sweeper's stale pass
 *  has long since handed the row to the paid engines. */
const RUNPOD_EXECUTION_MS = 15 * 60 * 1000;
const DISPATCH_TIMEOUT_MS = 10_000;

export interface WhisperConfig {
  /** https origin of the HTTP worker; empty when RunPod is the host. */
  url: string;
  secret: string;
  runpodKey: string;
  runpodEndpoint: string;
  configured: boolean;
}

export interface WorkerRow {
  enabled?: boolean | null;
  worker_url?: string | null;
  secret?: string | null;
  runpod_api_key?: string | null;
  runpod_endpoint_id?: string | null;
}

/** Environment first, then the service-only `transcription_worker` row. The
 *  row's `enabled` is the switch: off, every transcript goes to the paid
 *  engines exactly as before this existed. */
export function resolveWhisperConfig(env: (name: string) => string | undefined, row: WorkerRow | null): WhisperConfig {
  const rawUrl = env('WHISPER_WORKER_URL') || row?.worker_url || '';
  const url = rawUrl.startsWith('https://') ? rawUrl.replace(/\/+$/, '').replace(/\/jobs$/, '') : '';
  const secret = env('WHISPER_WORKER_SECRET') || row?.secret || '';
  const runpodKey = env('RUNPOD_API_KEY') || row?.runpod_api_key || '';
  const runpodEndpoint = env('RUNPOD_WHISPER_ENDPOINT_ID') || row?.runpod_endpoint_id || '';
  const enabled = env('WHISPER_WORKER_URL') ? true : row?.enabled === true;
  return {
    url,
    secret,
    runpodKey,
    runpodEndpoint,
    configured: enabled && !!secret && (!!url || (!!runpodKey && !!runpodEndpoint)),
  };
}

export interface WhisperJob {
  jobId: string;
  kind: string;
  ref: string;
  mediaUrl: string;
  diarize: boolean;
  callbackUrl: string;
}

export type Dispatch = { ok: true } | { ok: false; reason: string };

/** Hand one job to the worker. Anything but a clear acceptance is a reason to
 *  fall back now: a duplicate Whisper run costs nothing, a transcript that
 *  never arrives costs the viewer. */
export async function dispatchWhisper(
  cfg: WhisperConfig,
  job: WhisperJob,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<Dispatch> {
  if (!cfg.configured) return { ok: false, reason: 'whisper not configured' };
  const input = { ...job, startBy: Math.floor((now + WHISPER_START_WITHIN_MS) / 1000) };
  const runpod = !cfg.url;
  const target = runpod ? `https://api.runpod.ai/v2/${cfg.runpodEndpoint}/run` : `${cfg.url}/jobs`;
  const body = runpod
    ? { input: { ...input, secret: cfg.secret }, policy: { executionTimeout: RUNPOD_EXECUTION_MS, ttl: WHISPER_START_WITHIN_MS + RUNPOD_EXECUTION_MS } }
    : { input };
  try {
    const res = await fetchImpl(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runpod ? cfg.runpodKey : cfg.secret}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    await res.body?.cancel();
    return res.ok ? { ok: true } : { ok: false, reason: `whisper worker ${res.status}` };
  } catch (e) {
    return { ok: false, reason: `whisper worker unreachable (${(e as Error)?.name ?? 'error'})` };
  }
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface WhisperResult {
  segments: WhisperSegment[];
  fullText: string;
  /** As the worker spelled it; the caller normalizes. */
  lang: string | null;
  durationSeconds: number | null;
  model: string;
}

const MAX_SEGMENTS = 100_000;

/** The worker's answer in the shape the transcripts table stores. Word
 *  timings stay behind: nothing reads them yet and they would triple the row. */
export function fromWhisper(body: any): WhisperResult {
  if (!Array.isArray(body?.segments)) throw new Error('whisper result has no segments');
  if (body.segments.length > MAX_SEGMENTS) throw new Error('whisper result is implausibly long');
  const segments: WhisperSegment[] = [];
  for (const s of body.segments) {
    const text = String(s?.text ?? '').trim();
    if (!text) continue;
    const start = Number(s?.start) || 0;
    const end = Number(s?.end) || start;
    segments.push(s?.speaker ? { start, end, text, speaker: String(s.speaker) } : { start, end, text });
  }
  const duration = Math.floor(Number(body?.duration) || 0);
  return {
    segments,
    fullText: segments.map((s) => s.text).join(' '),
    lang: typeof body?.language === 'string' ? body.language : null,
    durationSeconds: duration > 0 ? duration : null,
    model: String(body?.model || 'whisper').slice(0, 40),
  };
}

/** Constant-time string comparison for the callback secret. */
export function secretMatches(given: string, expected: string): boolean {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
