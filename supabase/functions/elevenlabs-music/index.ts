/**
 * Text to music.
 *
 * Returns raw audio. The most expensive endpoint on the account, and the only
 * one of the studio's audio tools that is charged here rather than trusted to
 * have been charged on the client: the billable quantity is a number in the
 * body, so it can be clamped and then priced off the clamped value. A
 * hand-rolled request asking for ten minutes pays for ten minutes.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  readProviderError,
} from '../_shared/elevenlabs.ts';
import { chargeForJob } from '../_shared/ai-payment-guard.ts';

const MAX_PROMPT_CHARS = 2000;
const MIN_LENGTH_MS = 10_000;
const MAX_LENGTH_MS = 300_000;
/** Matches the unit TOOL_COST_USD['elevenlabs-music'] is priced in. */
const BILLING_BLOCK_MS = 10_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) ?? {};
    const { prompt, lengthSeconds, instrumental, outputFormat } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.length > MAX_PROMPT_CHARS) {
      return errorResponse(`Describe the track in 1-${MAX_PROMPT_CHARS} characters`);
    }

    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    const seconds = Number(lengthSeconds);
    const lengthMs = Math.min(
      MAX_LENGTH_MS,
      Math.max(MIN_LENGTH_MS, Number.isFinite(seconds) ? Math.round(seconds * 1000) : 60_000),
    );

    // Priced off the CLAMPED length, never off what the caller asked for. The
    // body is handed over because it has already been read — req.clone() throws
    // once the body is consumed.
    const charged = await chargeForJob(req, {
      kind: 'tool',
      modelId: 'elevenlabs-music',
      quantity: Math.ceil(lengthMs / BILLING_BLOCK_MS),
      body,
      actionType: 'elevenlabs-music',
      rateLimit: { limit: 20, windowMs: 60 * 60 * 1000 },
    });
    if (!charged.ok) return charged.response;

    const format = outputFormat === 'pcm_44100' ? 'pcm_44100' : 'mp3_44100_128';

    const response = await fetch(`https://api.elevenlabs.io/v1/music?output_format=${format}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        music_length_ms: lengthMs,
        model_id: 'music_v1',
        // The composer defaults this on. Vocals are the thing most likely to
        // make a track unusable as a bed under a video, so opting IN is the
        // safer default for what this is mostly used for.
        ...(instrumental === true ? { force_instrumental: true } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs music error:', response.status, errText);
      // The transfer pays for a track, not for an attempt. Put the price back
      // so the same payment covers the retry.
      await charged.refund();
      return errorResponse(readProviderError(errText, 'Music generation failed'), 502);
    }

    return audioResponse(
      await response.arrayBuffer(),
      format === 'pcm_44100' ? 'audio/wav' : 'audio/mpeg',
    );
  } catch (err) {
    console.error('elevenlabs-music error:', err);
    return errorResponse('Internal server error', 500);
  }
});
