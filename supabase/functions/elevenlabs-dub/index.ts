/**
 * Dubbing — translate a clip into another language, keeping the speaker's voice.
 *
 * The only one of these tools that is genuinely long-running, so it is the only
 * one split into start / poll / collect:
 *
 *   multipart POST                       start a dub, returns { dubbingId }
 *   { action: 'status', dubbingId }      where it has got to
 *   { action: 'result', dubbingId, ... } the finished audio, as raw bytes
 *
 * The three-step shape is what makes a dub survive a reload. The client
 * persists the dubbingId the moment it comes back, so a paid-for dub can be
 * rejoined rather than abandoned — the same reasoning as the video and mesh
 * tickets, and for the same reason: the money is already spent.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  jsonResponse,
  readProviderError,
  readUpload,
} from '../_shared/elevenlabs.ts';
import { chargeForJob } from '../_shared/ai-payment-guard.ts';
import { serviceClient } from '../_shared/auth.ts';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const contentType = req.headers.get('content-type') ?? '';
  // Starting a dub and polling one are the same endpoint but not remotely the
  // same cost, so they get separate buckets. A single dub polls every 8s for up
  // to 20 minutes — about 150 calls — so one shared limit low enough to be
  // meaningful for starts would cut off a creator's second concurrent dub
  // halfway through.
  const isStart = contentType.includes('multipart/form-data');

  // Covers all three branches, polling included. Start is the expensive one,
  // but status and result were reachable by anyone holding a dubbing id, which
  // made a creator's own footage fetchable by a stranger who had one.
  //
  // Not yet priced, for the same reason as the voice changer: the bill is per
  // minute of the upload and nothing here can measure that yet.
  const charged = await chargeForJob(req, {
    kind: 'tool',
    modelId: 'elevenlabs-dub',
    actionType: isStart ? 'elevenlabs-dub-start' : 'elevenlabs-dub-poll',
    rateLimit: isStart
      ? { limit: 10, windowMs: 60 * 60 * 1000 }
      : { limit: 1200, windowMs: 60 * 60 * 1000 },
    free: true,
  });
  if (!charged.ok) return charged.response;

  try {
    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    // ── Poll / collect ──────────────────────────────────────────────────────
    if (!isStart) {
      const { action, dubbingId, targetLang } = (await req.json()) ?? {};
      if (!dubbingId || typeof dubbingId !== 'string') {
        return errorResponse('dubbingId is required');
      }

      // A dub id used to be the whole credential: hold one, get the audio. It
      // is now checked against the wallet that started the job.
      //
      // A job with no row is one that began before this shipped. Those are
      // allowed through rather than stranded — the money for them is already
      // spent — and they age out as they finish. Every new dub gets a row, so
      // this is a grace period, not a standing hole.
      const owner = await dubOwner(dubbingId);
      if (owner && owner !== charged.wallet) {
        return errorResponse('That dub is not available to you.', 403);
      }

      if (action === 'result') {
        const lang = typeof targetLang === 'string' && targetLang ? targetLang : 'en';
        const response = await fetch(
          `https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/${lang}`,
          { headers: { 'xi-api-key': apiKey } },
        );
        if (!response.ok) {
          const errText = await response.text();
          console.error('ElevenLabs dub result error:', response.status, errText);
          return errorResponse(readProviderError(errText, 'Could not fetch the dubbed audio'), 502);
        }
        return audioResponse(await response.arrayBuffer(), 'audio/mpeg');
      }

      const response = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('ElevenLabs dub status error:', response.status, errText);
        return errorResponse(readProviderError(errText, 'Could not read the dub status'), 502);
      }
      const data = await response.json();
      return jsonResponse({
        // 'dubbing' | 'dubbed' | 'failed'
        status: data.status ?? 'dubbing',
        targetLanguages: data.target_languages ?? [],
        error: data.error ?? null,
      });
    }

    // ── Start ───────────────────────────────────────────────────────────────
    const upload = await readUpload(req);
    if (!upload) return errorResponse('An audio or video file is required');
    const { file, form } = upload;

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse('That file is over 100 MB. Use a shorter or smaller one.');
    }

    const targetLanguage = form.get('targetLang');
    if (!targetLanguage || typeof targetLanguage !== 'string') {
      return errorResponse('targetLang is required');
    }

    const outbound = new FormData();
    outbound.append('file', file, file.name || 'input.mp4');
    outbound.append('target_lang', targetLanguage);

    // Everything below is optional upstream, and an empty string is NOT the
    // same as absent — source_lang='' makes it reject rather than auto-detect.
    const sourceLang = form.get('sourceLang');
    if (typeof sourceLang === 'string' && sourceLang) outbound.append('source_lang', sourceLang);

    const speakers = Number(form.get('numSpeakers'));
    if (Number.isFinite(speakers) && speakers > 0) {
      outbound.append('num_speakers', String(Math.min(10, Math.round(speakers))));
    }

    // Watermark off unless asked for: this is a creator's own footage and the
    // result goes straight into their timeline.
    outbound.append('watermark', String(form.get('watermark') === 'true'));

    const response = await fetch('https://api.elevenlabs.io/v1/dubbing', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: outbound,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs dub start error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Could not start the dub'), 502);
    }

    const data = await response.json();
    if (!data.dubbing_id) {
      return errorResponse('The dubbing service did not return a job id', 502);
    }

    await claimDub(String(data.dubbing_id), charged.wallet);

    return jsonResponse({
      dubbingId: data.dubbing_id,
      expectedDurationSec: data.expected_duration_sec ?? null,
      targetLang: targetLanguage,
    });
  } catch (err) {
    console.error('elevenlabs-dub error:', err);
    return errorResponse('Internal server error', 500);
  }
});

/**
 * The wallet that started a dub, or null if nothing has claimed it.
 *
 * Null covers two cases that are treated the same on purpose: a job from before
 * dub_jobs existed, and a job whose claim did not land. Both are allowed
 * through, because refusing would strand a dub that has already been paid for.
 */
async function dubOwner(dubbingId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('dub_jobs')
    .select('wallet_address')
    .eq('dubbing_id', dubbingId)
    .maybeSingle();

  if (error) {
    console.error('[elevenlabs-dub] owner lookup failed:', error);
    return null;
  }
  const wallet = data?.wallet_address;
  return wallet ? String(wallet).toLowerCase() : null;
}

/**
 * Record who a dub belongs to, once the provider has given it an id.
 *
 * Deliberately does NOT fail the request. By the time this runs the dub is
 * already running upstream and has been paid for, so a bookkeeping error must
 * not be reported to the creator as a failed job — it would send them to pay
 * for a second one. The cost of losing the row is that this dub falls into the
 * unclaimed case above and stays reachable by its id, which is exactly where it
 * was before any of this.
 */
async function claimDub(dubbingId: string, wallet: string): Promise<void> {
  const { error } = await serviceClient()
    .from('dub_jobs')
    .insert({ dubbing_id: dubbingId, wallet_address: wallet });
  if (error) console.error('[elevenlabs-dub] could not claim job:', error);
}
