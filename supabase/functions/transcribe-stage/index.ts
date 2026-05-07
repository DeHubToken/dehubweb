// Transcribe an ended Stage's recording using ElevenLabs Scribe v2
// with speaker diarization. Stores results in stage_transcripts.
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
      cur.text += (w.text?.startsWith(' ') ? '' : '') + w.text;
      cur.end = w.end ?? cur.end;
    }
  }
  if (cur) segs.push(cur);
  return segs.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

  try {
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

    const { stageId } = await req.json();
    if (!stageId) throw new Error('stageId required');

    const wallet = (req.headers.get('x-wallet-address') || '').toLowerCase();
    if (!wallet) throw new Error('wallet required');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch stage and verify host
    const { data: stage, error: stageErr } = await admin
      .from('audio_spaces')
      .select('id, host_wallet_address, recording_url, status')
      .eq('id', stageId)
      .maybeSingle();
    if (stageErr || !stage) throw new Error('stage not found');
    if ((stage.host_wallet_address || '').toLowerCase() !== wallet) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!stage.recording_url) throw new Error('no recording available');

    // If already exists, refuse re-run unless failed
    const { data: existing } = await admin
      .from('stage_transcripts')
      .select('id, status')
      .eq('stage_id', stageId)
      .maybeSingle();
    if (existing && (existing.status === 'ready' || existing.status === 'processing')) {
      return new Response(JSON.stringify({ ok: true, status: existing.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert pending row
    await admin
      .from('stage_transcripts')
      .upsert({ stage_id: stageId, status: 'processing', error: null }, { onConflict: 'stage_id' });

    // Background work
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

        await admin
          .from('stage_transcripts')
          .update({
            status: 'ready',
            full_text: fullText,
            segments,
            source_language: lang,
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
