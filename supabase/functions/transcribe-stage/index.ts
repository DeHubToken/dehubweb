// Transcribe an ended Stage's recording using ElevenLabs Scribe v2 with
// speaker diarization. Stores results in stage_transcripts.
//
// Speaker labeling:
//   - Caller may pass a `timeline` describing AI / TTS / soundboard windows
//     (seconds, relative to recording start). For each diarized speaker,
//     we compute overlap with those AI windows. Speakers dominated by AI
//     overlap are labeled as AI; the remaining diarized speaker (typically
//     the host / mic) is labeled as the host wallet. Other human speakers
//     are left as Speaker N (we have no way to know who they are).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ScribeWord {
  text: string;
  start: number;
  end: number;
  speaker_id?: string;
  speaker?: string;
  type?: string;
}

interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface TimelineWindow {
  start: number;
  end: number;
  kind: 'ai' | 'human';
  source: string;
  label: string;
}

interface SpeakerMapEntry {
  type: 'ai' | 'user' | 'unknown';
  label?: string;
  source?: string;
  wallet?: string;
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

/** Sum overlap (seconds) between [a0,a1] and [b0,b1]. */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Build a speaker_map: for each diarized speaker, decide whether it is an
 * AI/injection speaker (mostly overlapping with AI windows) or a human, and
 * label the dominant human as the host wallet.
 */
function buildSpeakerMap(
  segments: Segment[],
  timeline: TimelineWindow[],
  hostWallet: string | null,
): Record<string, SpeakerMapEntry> {
  const map: Record<string, SpeakerMapEntry> = {};
  if (!segments.length) return map;

  // Aggregate per-speaker total duration + AI overlap + best AI label.
  const stats = new Map<string, {
    total: number;
    aiOverlap: number;
    aiLabel: string | null;
    aiSource: string | null;
  }>();

  for (const seg of segments) {
    const dur = Math.max(0, seg.end - seg.start);
    const cur = stats.get(seg.speaker) ?? { total: 0, aiOverlap: 0, aiLabel: null, aiSource: null };
    cur.total += dur;

    let bestLabel = cur.aiLabel;
    let bestSource = cur.aiSource;
    let bestLabelOverlap = 0;
    for (const win of timeline) {
      if (win.kind !== 'ai') continue;
      const o = overlap(seg.start, seg.end, win.start, win.end);
      if (o > 0) cur.aiOverlap += o;
      if (o > bestLabelOverlap) {
        bestLabelOverlap = o;
        bestLabel = win.label;
        bestSource = win.source;
      }
    }
    cur.aiLabel = bestLabel;
    cur.aiSource = bestSource;
    stats.set(seg.speaker, cur);
  }

  // Classify
  const humans: string[] = [];
  for (const [spk, s] of stats) {
    const ratio = s.total > 0 ? s.aiOverlap / s.total : 0;
    if (ratio >= 0.4 && s.aiLabel) {
      map[spk] = { type: 'ai', label: s.aiLabel, source: s.aiSource ?? undefined };
    } else {
      humans.push(spk);
    }
  }

  // Pick the human speaker with the most total time → that's the host.
  if (humans.length && hostWallet) {
    humans.sort((a, b) => (stats.get(b)?.total ?? 0) - (stats.get(a)?.total ?? 0));
    map[humans[0]] = { type: 'user', wallet: hostWallet.toLowerCase() };
    for (const h of humans.slice(1)) {
      map[h] = { type: 'unknown' };
    }
  } else {
    for (const h of humans) map[h] = { type: 'unknown' };
  }

  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

  try {
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const stageId: string | undefined = body?.stageId;
    const timeline: TimelineWindow[] = Array.isArray(body?.timeline) ? body.timeline : [];
    const force: boolean = !!body?.force;
    if (!stageId) throw new Error('stageId required');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: stage, error: stageErr } = await admin
      .from('audio_spaces')
      .select('id, recording_url, status, host_wallet_address')
      .eq('id', stageId)
      .maybeSingle();
    if (stageErr || !stage) throw new Error('stage not found');
    if (stage.status !== 'ended') throw new Error('stage not ended');
    if (!stage.recording_url) throw new Error('no recording available');

    const { data: existing } = await admin
      .from('stage_transcripts')
      .select('id, status')
      .eq('stage_id', stageId)
      .maybeSingle();
    if (!force && existing && (existing.status === 'ready' || existing.status === 'processing')) {
      return new Response(JSON.stringify({ ok: true, status: existing.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin
      .from('stage_transcripts')
      .upsert({
        stage_id: stageId,
        status: 'processing',
        error: null,
        speaker_timeline: timeline,
      }, { onConflict: 'stage_id' });

    const work = (async () => {
      try {
        const audioRes = await fetch(stage.recording_url!);
        if (!audioRes.ok) throw new Error(`audio fetch ${audioRes.status}`);
        const audioBlob = await audioRes.blob();

        const fd = new FormData();
        fd.append('file', audioBlob, 'recording.webm');
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
          throw new Error(`STT ${sttRes.status}: ${t.slice(0, 300)}`);
        }
        const json = await sttRes.json();
        const words: ScribeWord[] = json.words || [];
        const segments = wordsToSegments(words);
        const fullText = json.text || segments.map((s) => s.text).join(' ');
        const lang = json.language_code || json.detected_language || null;

        const speakerMap = buildSpeakerMap(segments, timeline, stage.host_wallet_address ?? null);

        await admin
          .from('stage_transcripts')
          .update({
            status: 'ready',
            full_text: fullText,
            segments,
            source_language: lang,
            speaker_map: speakerMap,
            speaker_timeline: timeline,
            error: null,
          })
          .eq('stage_id', stageId);
      } catch (e) {
        await admin
          .from('stage_transcripts')
          .update({ status: 'failed', error: String((e as Error).message || e) })
          .eq('stage_id', stageId);
      }
    })();

    // @ts-ignore - EdgeRuntime is provided in Deno deploy
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;

    return new Response(JSON.stringify({ ok: true, status: 'processing' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
