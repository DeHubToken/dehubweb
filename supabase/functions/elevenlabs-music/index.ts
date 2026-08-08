/**
 * Text to music.
 *
 * Returns raw audio. This is the most expensive endpoint on the account and the
 * client charges DHB before calling it, so the length is clamped HERE as well:
 * the paywall prices a specific number of seconds and this is what stops a
 * hand-rolled request asking for ten minutes at the one-minute price.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  readProviderError,
} from '../_shared/elevenlabs.ts';

const MAX_PROMPT_CHARS = 2000;
const MIN_LENGTH_MS = 10_000;
const MAX_LENGTH_MS = 300_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { prompt, lengthSeconds, instrumental, outputFormat } = (await req.json()) ?? {};

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
