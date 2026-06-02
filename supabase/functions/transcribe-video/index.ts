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
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const MODEL = 'google/gemini-2.5-flash-lite';
const CHUNK_SECONDS = 480; // 8 min
const MIN_CHUNK_SECONDS = 60;
const MAX_RETRIES_PER_CHUNK = 3;

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function buildVideoUrl(tokenId: number) {
  return `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${tokenId}.mp4`;
}

async function fetchVideoDuration(tokenId: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.dehub.io/nft/${tokenId}`);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j?.videoDuration ?? j?.duration ?? j?.video?.duration;
    return typeof d === 'number' && d > 0 ? Math.floor(d) : null;
  } catch {
    return null;
  }
}

interface Segment { start: number; end: number; text: string }

function parseJsonSegments(raw: string): Segment[] {
  // Strip code fences if present
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // Find first { or [
  const firstBrace = cleaned.search(/[\[{]/);
  if (firstBrace === -1) throw new Error('No JSON found in response');
  const slice = cleaned.slice(firstBrace);
  const parsed = JSON.parse(slice);
  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.segments)
      ? parsed.segments
      : [];
  return arr
    .map((s) => ({
      start: Number(s.start ?? s.startTime ?? 0),
      end: Number(s.end ?? s.endTime ?? 0),
      text: String(s.text ?? '').trim(),
    }))
    .filter((s) => s.text.length > 0 && !Number.isNaN(s.start));
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function fetchVideoAsDataUrl(videoUrl: string): Promise<string> {
  const r = await fetch(videoUrl);
  if (!r.ok) throw new Error(`Failed to fetch video: ${r.status}`);
  const mime = r.headers.get('content-type') || 'video/mp4';
  const buf = new Uint8Array(await r.arrayBuffer());
  // base64 encode in chunks to avoid call-stack issues
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) {
    bin += String.fromCharCode(...buf.subarray(i, i + CH));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

async function transcribeChunk(
  videoData: string,
  startSec: number,
  endSec: number,
): Promise<Segment[]> {
  const prompt =
    `Transcribe ONLY the portion of this video from ${fmtTime(startSec)} to ${fmtTime(endSec)} (seconds ${startSec}–${endSec}). ` +
    `Return a strict JSON object: {"segments":[{"start":<seconds>,"end":<seconds>,"text":"..."}]}. ` +
    `Use seconds offsets relative to the FULL video (so start values should be >= ${startSec}). ` +
    `Keep each segment to a single spoken sentence or ~10 seconds. No commentary, JSON only.`;

  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'video_url', video_url: { url: videoData } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    const err: any = new Error(`AI gateway ${resp.status}: ${body.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  return parseJsonSegments(raw);
}

async function transcribeRange(
  videoUrl: string,
  startSec: number,
  endSec: number,
  depth = 0,
): Promise<Segment[]> {
  let lastErr: any = null;
  for (let attempt = 0; attempt < MAX_RETRIES_PER_CHUNK; attempt++) {
    try {
      return await transcribeChunk(videoUrl, startSec, endSec);
    } catch (e: any) {
      lastErr = e;
      const status = e?.status;
      const recoverable = status === 429 || status === 413 || status === 500 || status === 503 || /context|length|token/i.test(e?.message ?? '');
      if (!recoverable) break;
      // Split & recurse
      const span = endSec - startSec;
      if (span > MIN_CHUNK_SECONDS && depth < 3) {
        const mid = startSec + Math.floor(span / 2);
        const a = await transcribeRange(videoUrl, startSec, mid, depth + 1);
        const b = await transcribeRange(videoUrl, mid, endSec, depth + 1);
        return [...a, ...b];
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error('transcribeRange failed');
}

async function runJob(tokenId: number) {
  const supa = admin();
  try {
    let duration = await fetchVideoDuration(tokenId);
    if (!duration) duration = 600; // fallback assume 10 min
    const chunks: Array<[number, number]> = [];
    for (let s = 0; s < duration; s += CHUNK_SECONDS) {
      chunks.push([s, Math.min(s + CHUNK_SECONDS, duration)]);
    }
    await supa.from('video_transcripts').upsert({
      token_id: tokenId,
      status: 'processing',
      duration_seconds: duration,
      chunks_total: chunks.length,
      chunks_done: 0,
      error: null,
    });

    const videoUrl = buildVideoUrl(tokenId);
    const videoData = await fetchVideoAsDataUrl(videoUrl);
    const all: Segment[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const [a, b] = chunks[i];
      const segs = await transcribeRange(videoData, a, b);
      all.push(...segs);
      await supa.from('video_transcripts')
        .update({ chunks_done: i + 1 })
        .eq('token_id', tokenId);
    }

    all.sort((x, y) => x.start - y.start);
    const full_text = all.map((s) => s.text).join(' ');
    await supa.from('video_transcripts').update({
      status: 'ready',
      transcript: { segments: all, full_text },
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
          chunks_total: 0,
          chunks_done: 0,
          error: null,
          transcript: null,
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
