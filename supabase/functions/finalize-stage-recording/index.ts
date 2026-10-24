// Make a finished stage recording seekable and playable everywhere, then hand
// it to transcription.
//
// Neither recorder produces a file every player can use:
//
//   web    MediaRecorder streams WebM, so the Segment and every Cluster carry
//          an unknown size, Info has no Duration and there are no Cues. And
//          WebM itself is unplayable on iPhone apps: AVPlayer has no WebM
//          demuxer (Safari only manages because WebKit ships its own).
//   mobile Agora writes a raw ADTS AAC elementary stream, which has no header
//          and no index of any kind.
//
// Browsers paper over the indexing (Chrome bisects clusters and estimates a
// bitrate), which is why that only ever showed up in the app: media3 returns
// SeekMap.Unseekable and a duration of C.TIME_UNSET, so the scrubber is dead
// and every seekTo is silently dropped.
//
// So both are re-filed as MP4: the web's Opus packets into an Opus MP4 (iOS
// 17+, Chrome, Firefox, Safari 17+ and media3 all play it), mobile's AAC into
// an M4A. If the Opus path cannot read a WebM, the older WebM repair is the
// fallback, so a file this cannot convert still comes out seekable.
//
// Nothing here transcodes. Every path only re-wraps the encoded packets, so
// the audio comes out bit-for-bit identical — which also means this is cheap
// enough to run inline on the upload path.
//
// The original object is never overwritten. The repair is written alongside it
// and audio_spaces.recording_url is repointed, so reverting is one UPDATE.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { repairWebm, AlreadyIndexed } from './webm.ts';
import { parseAdts, isAdts, AAC_SAMPLES_PER_FRAME } from './adts.ts';
import { buildM4a, buildOpusMp4 } from './mp4.ts';
import { extractOpus } from './opus.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'stage-recordings';

/** Objects this function itself produces — seeing one means the work is done. */
// recording.indexed.webm is deliberately not here any more: a WebM that was
// only indexed still cannot play on an iPhone, so it is taken on to MP4.
const FINALIZED = ['recording.m4a'];

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
  kind: 'opus' | 'webm' | 'aac';
  note?: string;
}

/** Pick a path from the bytes themselves; the extension has lied before. */
function finalize(src: Uint8Array): Finalized {
  const isEbml = src.length > 4 && src[0] === 0x1a && src[1] === 0x45 && src[2] === 0xdf && src[3] === 0xa3;

  if (isEbml) {
    try {
      const opus = extractOpus(src);
      const m = buildOpusMp4(opus);
      const notes = [
        opus.joinedStreams ? `joined ${opus.joinedStreams} restarted stream(s) (voice effect switched mid-recording)` : '',
        opus.droppedStreams ? `left out ${opus.droppedStreams} stream(s) with a different channel layout` : '',
      ].filter(Boolean);
      return {
        bytes: m.bytes,
        objectName: 'recording.mp4',
        contentType: 'audio/mp4',
        durationMs: m.durationMs,
        kind: 'opus',
        note: notes.length ? notes.join('; ') : undefined,
      };
    } catch (e) {
      console.warn(`[finalize] Opus MP4 not possible, indexing the WebM instead — ${(e as Error).message}`);
    }
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
        // Remuxing thousands of WebM packets can exceed an Edge isolate's CPU
        // allowance. Reuse the existing media host for AAC, which also plays
        // on iPhones older than iOS 17. Keep the original object intact.
        const { data: worker } = await admin.from('video_dub_worker').select('worker_url, secret').eq('id', 1).maybeSingle();
        const workerUrl = Deno.env.get('DUB_WORKER_URL') || worker?.worker_url || '';
        const secret = Deno.env.get('DUB_WORKER_SECRET') || worker?.secret || '';
        if (workerUrl && secret && /\/jobs\/?$/.test(workerUrl)) {
          const path = `${stageId}/recording.m4a`;
          const { data: upload, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
          if (error || !upload?.signedUrl) throw new Error('could not authorize recording upload');
          const result = await fetch(workerUrl.replace(/\/jobs\/?$/, '/recordings'), {
            method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { sourceUrl: stage.recording_url, uploadUrl: upload.signedUrl } }),
            signal: AbortSignal.timeout(180_000),
          });
          if (!result.ok) throw new Error(`recording worker ${result.status}`);
          const output = await result.json();
          if (!output.ok) throw new Error('recording worker did not finish');
          const { data: url } = admin.storage.from(BUCKET).getPublicUrl(path);
          const { error: updateError } = await admin.from('audio_spaces').update({ recording_url: url.publicUrl })
            .eq('id', stageId).eq('recording_url', stage.recording_url);
          if (updateError) throw updateError;
          return { ok: true, status: 'ready', recordingUrl: url.publicUrl, durationSeconds: output.durationSeconds };
        }
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
        return { ok: true, status: 'ready', recordingUrl: finalUrl, durationSeconds: out.durationMs / 1000 };
      } catch (e) {
        // The original object and recording_url are both untouched on this
        // path, so a failure here costs seeking and nothing else. Never let it
        // stop the transcript.
        const why = e instanceof AlreadyIndexed ? `already indexed: ${e.message}` : String((e as Error).message || e);
        console.error(`[finalize] ${stageId} left as-is — ${why}`);
        return { ok: false, status: 'failed', error: why };
      } finally {
        await transcribe();
      }
    })();

    // Playback needs the actual converted URL, not an accepted response that
    // leaves iPhone waiting for a background task which may have been killed.
    if (!thenTranscribe) {
      const result = await work;
      return json(result, result.ok ? 200 : 502);
    }

    // @ts-ignore - EdgeRuntime is provided by the platform
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else await work;

    return json({ ok: true, status: 'processing' });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});
