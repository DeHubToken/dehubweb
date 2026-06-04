// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')!;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function buildVideoUrl(tokenId: number) {
  return `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${tokenId}.mp4`;
}

interface Segment { start: number; end: number; text: string }
interface DeepgramWord { word: string; punctuated_word?: string; start: number; end: number }
interface DeepgramUtterance { start: number; end: number; transcript: string; words?: DeepgramWord[] }

function fmtVttTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(whole)}.${pad(ms, 3)}`;
}

function buildVtt(segments: Segment[]): string {
  const lines: string[] = ['WEBVTT', ''];
  segments.forEach((s, i) => {
    lines.push(String(i + 1));
    lines.push(`${fmtVttTime(s.start)} --> ${fmtVttTime(s.end)}`);
    lines.push(s.text);
    lines.push('');
  });
  return lines.join('\n');
}

async function runJob(tokenId: number) {
  const supa = admin();
  try {
    const videoUrl = buildVideoUrl(tokenId);

    // Single Deepgram call — handles full file, returns word-level timing.
    const dgUrl =
      'https://api.deepgram.com/v1/listen' +
      '?model=nova-3' +
      '&smart_format=true' +
      '&punctuate=true' +
      '&utterances=true' +
      '&detect_language=true';

    const resp = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: videoUrl }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Deepgram ${resp.status}: ${body.slice(0, 500)}`);
    }
    const data = await resp.json();

    const channel = data?.results?.channels?.[0];
    const detected = channel?.detected_language || channel?.alternatives?.[0]?.language || null;
    const utterances: DeepgramUtterance[] = data?.results?.utterances ?? [];

    let segments: Segment[];
    if (utterances.length > 0) {
      segments = utterances.map((u) => ({
        start: Number(u.start) || 0,
        end: Number(u.end) || 0,
        text: String(u.transcript || '').trim(),
      })).filter((s) => s.text.length > 0);
    } else {
      // Fallback: build from words at ~6-second windows
      const words: DeepgramWord[] = channel?.alternatives?.[0]?.words ?? [];
      segments = [];
      let cur: { start: number; end: number; words: string[] } | null = null;
      for (const w of words) {
        const piece = w.punctuated_word ?? w.word;
        if (!cur) cur = { start: w.start, end: w.end, words: [piece] };
        else if (w.end - cur.start > 6) {
          segments.push({ start: cur.start, end: cur.end, text: cur.words.join(' ') });
          cur = { start: w.start, end: w.end, words: [piece] };
        } else {
          cur.end = w.end;
          cur.words.push(piece);
        }
      }
      if (cur) segments.push({ start: cur.start, end: cur.end, text: cur.words.join(' ') });
    }

    const vtt = buildVtt(segments);
    const full_text = segments.map((s) => s.text).join(' ');
    const duration = Math.max(0, Math.floor(data?.metadata?.duration ?? 0));

    await supa.from('video_transcripts').update({
      status: 'ready',
      transcript: { segments, full_text },
      vtt_original: vtt,
      source_lang: detected,
      duration_seconds: duration || null,
      chunks_total: 1,
      chunks_done: 1,
      error: null,
    }).eq('token_id', tokenId);
  } catch (e: any) {
    await supa.from('video_transcripts').update({
      status: 'failed',
      error: String(e?.message ?? e).slice(0, 1000),
    }).eq('token_id', tokenId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const tokenId = Number(body?.tokenId);
    const action = String(body?.action ?? 'status');
    if (!Number.isFinite(tokenId) || tokenId <= 0) {
      return new Response(JSON.stringify({ error: 'invalid tokenId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supa = admin();
    const { data: existing } = await supa
      .from('video_transcripts')
      .select('*')
      .eq('token_id', tokenId)
      .maybeSingle();

    if (action === 'start') {
      if (!existing || existing.status === 'failed') {
        await supa.from('video_transcripts').upsert({
          token_id: tokenId,
          status: 'processing',
          chunks_total: 1,
          chunks_done: 0,
          error: null,
          transcript: null,
          vtt_original: null,
          source_lang: null,
        });
        // @ts-ignore - EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(runJob(tokenId));
        const { data: fresh } = await supa.from('video_transcripts').select('*').eq('token_id', tokenId).maybeSingle();
        return new Response(JSON.stringify(fresh), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(existing), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(existing ?? { status: 'absent', token_id: tokenId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
