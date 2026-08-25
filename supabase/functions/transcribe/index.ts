// deno-lint-ignore-file no-explicit-any
//
// One transcriber for everything DeHub can transcribe.
//
// This replaces `transcribe-video` and `transcribe-stage`, which were two
// programs doing one job with two status vocabularies, two retry stories (one
// of which was "none") and two tables. Both old names still answer — they now
// forward here — so a cached browser bundle and the shipped mobile build keep
// working.
//
// What is genuinely per-kind is the engine, and only the engine. A stage is
// diarized by ElevenLabs Scribe because its speaker map is matched against the
// room's own AI/soundboard timeline; everything else goes to Deepgram nova-3,
// which is cheaper for batch and now diarizes too. Both write the same row.
import {
  admin,
  buildVtt,
  corsHeaders,
  FULL_COLUMNS,
  isRetryable,
  json,
  MAX_ATTEMPTS,
  mediaIsReachable,
  normalizeLang,
  parseTarget,
  resolveMedia,
  type Segment,
  type Target,
  TargetError,
} from '../_shared/transcripts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY');
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

interface EngineResult {
  segments: Segment[];
  fullText: string;
  lang: string | null;
  durationSeconds: number | null;
  provider: string;
  model: string;
  speakerMap?: Record<string, unknown>;
}

/* ─────────────────────────────── Deepgram ───────────────────────────────── */

interface DgWord { word: string; punctuated_word?: string; start: number; end: number; speaker?: number }
interface DgUtterance { start: number; end: number; transcript: string; speaker?: number }

async function runDeepgram(url: string): Promise<EngineResult> {
  if (!DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY not configured');

  const dgUrl =
    'https://api.deepgram.com/v1/listen' +
    '?model=nova-3' +
    '&smart_format=true' +
    '&punctuate=true' +
    '&utterances=true' +
    // Diarization was off, so video segments had no speaker while stage
    // segments did — the two shapes could not share a renderer.
    '&diarize=true' +
    '&detect_language=true';

  const resp = await fetch(dgUrl, {
    method: 'POST',
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Deepgram ${resp.status}: ${body.slice(0, 500)}`);
  }
  const data = await resp.json();

  const channel = data?.results?.channels?.[0];
  const detected = channel?.detected_language || channel?.alternatives?.[0]?.language || null;
  const utterances: DgUtterance[] = data?.results?.utterances ?? [];

  let segments: Segment[];
  if (utterances.length > 0) {
    segments = utterances
      .map((u) => ({
        start: Number(u.start) || 0,
        end: Number(u.end) || 0,
        text: String(u.transcript || '').trim(),
        speaker: u.speaker !== undefined ? `speaker_${u.speaker}` : undefined,
      }))
      .filter((s) => s.text.length > 0);
  } else {
    const words: DgWord[] = channel?.alternatives?.[0]?.words ?? [];
    segments = [];
    let cur: { start: number; end: number; words: string[]; speaker?: string } | null = null;
    for (const w of words) {
      const piece = w.punctuated_word ?? w.word;
      const speaker = w.speaker !== undefined ? `speaker_${w.speaker}` : undefined;
      if (!cur || (cur.speaker !== speaker) || w.end - cur.start > 6) {
        if (cur) segments.push({ start: cur.start, end: cur.end, text: cur.words.join(' '), speaker: cur.speaker });
        cur = { start: w.start, end: w.end, words: [piece], speaker };
      } else {
        cur.end = w.end;
        cur.words.push(piece);
      }
    }
    if (cur) segments.push({ start: cur.start, end: cur.end, text: cur.words.join(' '), speaker: cur.speaker });
  }

  return {
    segments,
    fullText: segments.map((s) => s.text).join(' '),
    lang: normalizeLang(detected),
    durationSeconds: Math.max(0, Math.floor(Number(data?.metadata?.duration ?? 0))) || null,
    provider: 'deepgram',
    model: 'nova-3',
  };
}

/* ──────────────────────────── ElevenLabs Scribe ─────────────────────────── */

interface ScribeWord { text: string; start: number; end: number; speaker_id?: string; speaker?: string; type?: string }

interface TimelineWindow { start: number; end: number; kind: 'ai' | 'human'; source: string; label: string }
interface SpeakerMapEntry { type: 'ai' | 'user' | 'unknown'; label?: string; source?: string; wallet?: string }

const AUDIO_TYPE_BY_EXT: Record<string, string> = {
  webm: 'audio/webm', aac: 'audio/aac', m4a: 'audio/mp4', mp4: 'audio/mp4',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
  flac: 'audio/flac',
};

/**
 * Name and type the multipart part after the bytes actually being sent.
 * Recordings arrive in three shapes — dehubweb's MediaRecorder writes
 * WebM/Opus, mobile uploads Agora's raw ADTS AAC, and one hand-remuxed Town
 * Hall is M4A. Hardcoding `recording.webm` only ever worked because Scribe
 * sniffs content, which nothing in its contract promises.
 */
function describeRecording(url: string, servedType: string): { name: string; type: string } {
  const ext = (url.split('?')[0].split('/').pop() ?? '').split('.').pop()?.toLowerCase() ?? '';
  const byExt = AUDIO_TYPE_BY_EXT[ext];
  if (byExt) return { name: `recording.${ext}`, type: byExt };
  const served = servedType.split(';')[0].trim().toLowerCase();
  const knownExt = Object.keys(AUDIO_TYPE_BY_EXT).find((e) => AUDIO_TYPE_BY_EXT[e] === served);
  return knownExt ? { name: `recording.${knownExt}`, type: served } : { name: 'recording.webm', type: 'audio/webm' };
}

function wordsToSegments(words: ScribeWord[]): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const w of words) {
    if (w.type && w.type !== 'word' && w.type !== 'spacing') continue;
    const speaker = w.speaker_id || w.speaker || 'speaker_1';
    if (!cur || cur.speaker !== speaker) {
      if (cur) segs.push(cur);
      cur = { speaker, text: w.text || '', start: w.start ?? 0, end: w.end ?? 0 };
    } else {
      cur.text += w.text;
      cur.end = w.end ?? cur.end;
    }
  }
  if (cur) segs.push(cur);
  return segs.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Decide which diarized speakers are the room's own AI/soundboard injections
 *  and which is the host, by overlapping each against the timeline the client
 *  recorded while the stage ran. */
function buildSpeakerMap(
  segments: Segment[],
  timeline: TimelineWindow[],
  hostWallet: string | null,
): Record<string, SpeakerMapEntry> {
  const map: Record<string, SpeakerMapEntry> = {};
  const stats = new Map<string, { total: number; ai: number; window?: TimelineWindow }>();

  for (const seg of segments) {
    const spk = seg.speaker ?? 'speaker_1';
    const entry = stats.get(spk) ?? { total: 0, ai: 0 };
    entry.total += Math.max(0, seg.end - seg.start);
    for (const w of timeline) {
      if (w.kind !== 'ai') continue;
      const ov = overlap(seg.start, seg.end, w.start, w.end);
      if (ov > 0) {
        entry.ai += ov;
        if (!entry.window) entry.window = w;
      }
    }
    stats.set(spk, entry);
  }

  const humans: string[] = [];
  for (const [spk, s] of stats) {
    if (s.total > 0 && s.ai / s.total > 0.5 && s.window) {
      map[spk] = { type: 'ai', label: s.window.label, source: s.window.source };
    } else {
      humans.push(spk);
    }
  }

  if (humans.length && hostWallet) {
    humans.sort((a, b) => (stats.get(b)?.total ?? 0) - (stats.get(a)?.total ?? 0));
    map[humans[0]] = { type: 'user', wallet: hostWallet.toLowerCase() };
    for (const h of humans.slice(1)) map[h] = { type: 'unknown' };
  } else {
    for (const h of humans) map[h] = { type: 'unknown' };
  }
  return map;
}

async function runScribe(
  url: string,
  timeline: TimelineWindow[],
  hostWallet: string | null,
): Promise<EngineResult> {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
  const audioBlob = await audioRes.blob();
  const audio = describeRecording(url, audioBlob.type);

  const fd = new FormData();
  fd.append('file', new Blob([audioBlob], { type: audio.type }), audio.name);
  fd.append('model_id', 'scribe_v2');
  fd.append('diarize', 'true');
  fd.append('tag_audio_events', 'false');

  const sttRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: fd,
  });
  if (!sttRes.ok) {
    const t = await sttRes.text();
    throw new Error(`Scribe ${sttRes.status}: ${t.slice(0, 300)}`);
  }
  const jsonBody = await sttRes.json();
  const segments = wordsToSegments(jsonBody.words || []);

  return {
    segments,
    fullText: jsonBody.text || segments.map((s) => s.text).join(' '),
    lang: normalizeLang(jsonBody.language_code || jsonBody.detected_language),
    durationSeconds: null,
    provider: 'elevenlabs',
    model: 'scribe_v2',
    speakerMap: buildSpeakerMap(segments, timeline, hostWallet),
  };
}

/* ──────────────────────────────── the job ───────────────────────────────── */

async function runJob(target: Target, mediaUrl: string, timeline: TimelineWindow[]) {
  const db = admin();
  try {
    let hostWallet: string | null = null;
    if (target.kind === 'stage') {
      const { data } = await db
        .from('audio_spaces')
        .select('host_wallet_address')
        .eq('id', target.ref)
        .maybeSingle();
      hostWallet = data?.host_wallet_address ?? null;
    }

    const result = target.kind === 'stage'
      ? await runScribe(mediaUrl, timeline, hostWallet)
      : await runDeepgram(mediaUrl);

    // Nothing said is its own outcome. Storing it as 'ready' is what left two
    // videos and one stage permanently showing captions that never speak:
    // every "already done" check passed and nothing could ever re-run them.
    const isEmpty = result.segments.length === 0 || !result.fullText.trim();

    await db.from('transcripts').update({
      status: isEmpty ? 'empty' : 'ready',
      provider: result.provider,
      model: result.model,
      source_lang: result.lang,
      segments: result.segments,
      full_text: result.fullText,
      vtt: isEmpty ? null : buildVtt(result.segments),
      duration_seconds: result.durationSeconds ?? undefined,
      speaker_map: result.speakerMap ?? {},
      summary_status: isEmpty ? 'skipped' : 'processing',
      error: null,
    }).eq('source_kind', target.kind).eq('source_ref', target.ref);

    if (!isEmpty) {
      // Fire and forget. A missing summary is a cosmetic loss; failing the
      // transcript over it is not.
      fetch(`${SUPABASE_URL}/functions/v1/summarize-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ kind: target.kind, ref: target.ref, force: true }),
      }).catch((e) => console.warn('summarize kick failed', e));
    }
  } catch (e: any) {
    await db.from('transcripts').update({
      status: 'failed',
      error: String(e?.message ?? e).slice(0, 1000),
    }).eq('source_kind', target.kind).eq('source_ref', target.ref);
  }
}

/* ──────────────────────────────── handler ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const target = parseTarget(body);
    if (!target) return json({ error: 'a valid { kind, ref } is required' }, 400);

    const action = String(body?.action ?? (body?.stageId ? 'start' : 'status'));
    const force = body?.force === true;
    const timeline: TimelineWindow[] = Array.isArray(body?.timeline) ? body.timeline : [];

    const db = admin();
    const { data: existing } = await db
      .from('transcripts')
      .select(FULL_COLUMNS)
      .eq('source_kind', target.kind)
      .eq('source_ref', target.ref)
      .maybeSingle();

    if (action !== 'start') {
      return json(existing ?? { status: 'absent', source_kind: target.kind, source_ref: target.ref });
    }

    if (existing) {
      const row = existing as any;
      if (row.status === 'ready' && !force) return json(row);
      if (row.status === 'processing' && !force && !isRetryable(row)) return json(row);
      if ((row.status === 'failed' || row.status === 'empty') && !force && row.attempts >= MAX_ATTEMPTS) {
        return json(row);
      }
      if ((row.status === 'failed' || row.status === 'pending') && !force && !isRetryable(row)) {
        return json(row);
      }
    }

    // Only now does it cost anything to look the source up.
    let media;
    try {
      media = await resolveMedia(target, db);
    } catch (e) {
      if (e instanceof TargetError) return json({ error: e.message }, e.status);
      throw e;
    }

    // "Not yet" is not "no". A post asked for seconds after upload is still
    // transcoding; the sweeper will come back for it, and the attempt counter
    // is deliberately not touched so waiting never burns a retry.
    if (media.notReady || !media.url) {
      await db.from('transcripts').upsert({
        source_kind: target.kind,
        source_ref: target.ref,
        status: 'pending',
        visibility: media.visibility,
        duration_seconds: media.durationSeconds,
        error: media.notReady ?? 'no media yet',
      }, { onConflict: 'source_kind,source_ref' });
      return json({ status: 'pending', reason: media.notReady ?? 'no media yet' }, 202);
    }

    const reach = await mediaIsReachable(media.url);
    if (!reach.ok) {
      await db.from('transcripts').upsert({
        source_kind: target.kind,
        source_ref: target.ref,
        status: 'pending',
        visibility: media.visibility,
        duration_seconds: media.durationSeconds,
        error: `media not reachable yet (${reach.status})`,
      }, { onConflict: 'source_kind,source_ref' });
      return json({ status: 'pending', reason: `media ${reach.status}` }, 202);
    }

    const attempts = (existing as any)?.attempts ?? 0;
    await db.from('transcripts').upsert({
      source_kind: target.kind,
      source_ref: target.ref,
      status: 'processing',
      visibility: media.visibility,
      duration_seconds: media.durationSeconds,
      attempts: attempts + 1,
      last_attempt_at: new Date().toISOString(),
      speaker_timeline: target.kind === 'stage' ? timeline : undefined,
      error: null,
    }, { onConflict: 'source_kind,source_ref' });

    const work = runJob(target, media.url, timeline);
    // @ts-ignore EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;

    const { data: fresh } = await db
      .from('transcripts')
      .select(FULL_COLUMNS)
      .eq('source_kind', target.kind)
      .eq('source_ref', target.ref)
      .maybeSingle();

    return json(fresh ?? { status: 'processing' });
  } catch (e: any) {
    console.error('transcribe error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
