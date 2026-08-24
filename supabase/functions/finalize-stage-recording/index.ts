// Make a finished stage recording seekable, then hand it to transcription.
//
// Neither recorder produces a file a player can scrub:
//
//   web    MediaRecorder streams WebM, so the Segment and every Cluster carry
//          an unknown size, Info has no Duration and there are no Cues.
//   mobile Agora writes a raw ADTS AAC elementary stream, which has no header
//          and no index of any kind.
//
// Browsers paper over both (Chrome bisects clusters and estimates a bitrate),
// which is why this only ever showed up in the app: media3 returns
// SeekMap.Unseekable and a duration of C.TIME_UNSET, so the scrubber is dead
// and every seekTo is silently dropped.
//
// Web already fixes its own half in the browser, on the way to the bucket
// (src/lib/webm-seekable.ts, #422) — cheaper than a round trip and it needs no
// deploy. So the AAC path here is the one that carries mobile, and the WebM
// path is the net beneath the client pass, which fails open by design and
// would otherwise leave an unindexed upload with nothing to catch it.
//
// Nothing here transcodes. The WebM path rewrites only the container's
// bookkeeping and the AAC path only re-wraps existing access units, so the
// audio comes out bit-for-bit identical either way — which also means this is
// cheap enough to run inline on the upload path.
//
// The original object is never overwritten. The repair is written alongside it
// and audio_spaces.recording_url is repointed, so reverting is one UPDATE.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { repairWebm, AlreadyIndexed } from './webm.ts';
import { parseAdts, isAdts, AAC_SAMPLES_PER_FRAME } from './adts.ts';
import { buildM4a } from './mp4.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'stage-recordings';

/** Objects this function itself produces — seeing one means the work is done. */
const FINALIZED = ['recording.m4a', 'recording.indexed.webm'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface Finalized {
  bytes: Uint8Array;
  objectName: string;
  contentType: string;
  durationMs: number;
  kind: 'webm' | 'aac';
  note?: string;
}

/** Pick a path from the bytes themselves; the extension has lied before. */
function finalize(src: Uint8Array): Finalized {
  const isEbml = src.length > 4 && src[0] === 0x1a && src[1] === 0x45 && src[2] === 0xdf && src[3] === 0xa3;

  if (isEbml) {
    const r = repairWebm(src);
    return {
      bytes: r.bytes,
      objectName: 'recording.indexed.webm',
      contentType: 'audio/webm',
      durationMs: r.durationMs,
      kind: 'webm',
      note: r.truncatedAtSecondStream
        ? `dropped a second concatenated stream (voice effect switched mid-recording); kept ${r.clusters} clusters`
        : undefined,
    };
  }

  if (isAdts(src)) {
    const a = parseAdts(src);
    const m = buildM4a({
      samples: a.frames,
      samplesPerFrame: AAC_SAMPLES_PER_FRAME,
      sampleRate: a.sampleRate,
      channels: a.channels,
      asc: a.asc,
    });
    return {
      bytes: m.bytes,
      objectName: 'recording.m4a',
      contentType: 'audio/mp4',
      durationMs: m.durationMs,
      kind: 'aac',
      note: a.resyncs ? `skipped ${a.resyncs} unparseable bytes while resyncing` : undefined,
    };
  }

  throw new Error('unrecognised container — not WebM and not ADTS AAC');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const body = await req.json().catch(() => ({}));
    const stageId: string | undefined = body?.stageId;
    const force = !!body?.force;
    // The caller usually wants transcription to follow. It is chained here so
    // the transcriber always reads the finalized object, and it runs whether or
    // not the repair worked — a stage that cannot be remuxed must still get its
    // transcript, exactly as before this function existed.
    const thenTranscribe = body?.transcribe !== false;
    const timeline = Array.isArray(body?.timeline) ? body.timeline : [];
    if (!stageId) throw new Error('stageId required');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: stage, error: stageErr } = await admin
      .from('audio_spaces')
      .select('id, recording_url, status')
      .eq('id', stageId)
      .maybeSingle();
    if (stageErr || !stage) throw new Error('stage not found');
    if (!stage.recording_url) throw new Error('no recording available');

    const transcribe = async () => {
      if (!thenTranscribe) return;
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/transcribe-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ stageId, timeline }),
        });
      } catch (e) {
        console.warn('transcribe-stage invoke failed', e);
      }
    };

    const already = FINALIZED.some((name) => stage.recording_url!.endsWith(name));
    if (already && !force) {
      await transcribe();
      return json({ ok: true, status: 'already-finalized', recordingUrl: stage.recording_url });
    }

    const work = (async () => {
      try {
        const res = await fetch(stage.recording_url!);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const src = new Uint8Array(await res.arrayBuffer());

        const out = finalize(src);
        const path = `${stageId}/${out.objectName}`;

        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, out.bytes, { contentType: out.contentType, upsert: true });
        if (upErr) throw new Error(`upload failed: ${upErr.message}`);

        const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
        const finalUrl = urlData?.publicUrl;
        if (!finalUrl) throw new Error('no public url for the finalized object');

        const { error: updErr } = await admin
          .from('audio_spaces')
          .update({ recording_url: finalUrl })
          .eq('id', stageId);
        if (updErr) throw new Error(`recording_url update failed: ${updErr.message}`);

        console.log(
          `[finalize] ${stageId} ${out.kind} ${src.length}B -> ${out.bytes.length}B, ` +
          `${(out.durationMs / 1000).toFixed(3)}s, now at ${out.objectName}` +
          (out.note ? ` (${out.note})` : ''),
        );
      } catch (e) {
        // The original object and recording_url are both untouched on this
        // path, so a failure here costs seeking and nothing else. Never let it
        // stop the transcript.
        const why = e instanceof AlreadyIndexed ? `already indexed: ${e.message}` : String((e as Error).message || e);
        console.error(`[finalize] ${stageId} left as-is — ${why}`);
      }
      await transcribe();
    })();

    // @ts-ignore - EdgeRuntime is provided by the platform
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;

    return json({ ok: true, status: 'processing' });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});
