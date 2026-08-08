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

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    const contentType = req.headers.get('content-type') ?? '';

    // ── Poll / collect ──────────────────────────────────────────────────────
    if (!contentType.includes('multipart/form-data')) {
      const { action, dubbingId, targetLang } = (await req.json()) ?? {};
      if (!dubbingId || typeof dubbingId !== 'string') {
        return errorResponse('dubbingId is required');
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
