/**
 * Text to sound effect.
 *
 * Returns raw audio, same contract as elevenlabs-tts: the client reads the body
 * as a Blob rather than going through functions-js.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  num,
  readProviderError,
} from '../_shared/elevenlabs.ts';

const MAX_PROMPT_CHARS = 1000;
/** The provider's own ceiling for a single effect. */
const MAX_DURATION_SECONDS = 30;
const MIN_DURATION_SECONDS = 0.5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { text, durationSeconds, promptInfluence, loop, outputFormat } = (await req.json()) ?? {};

    if (!text || typeof text !== 'string' || text.length > MAX_PROMPT_CHARS) {
      return errorResponse(`Describe the sound in 1-${MAX_PROMPT_CHARS} characters`);
    }

    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    const payload: Record<string, unknown> = {
      text,
      model_id: 'eleven_text_to_sound_v2',
      // 0 follows the prompt loosely, 1 follows it literally. The provider's own
      // default sits in the middle.
      prompt_influence: num(promptInfluence, 0, 1, 0.3),
      loop: loop === true,
    };

    // Omitting duration entirely is meaningful: it tells the model to choose a
    // natural length for what was described. Sending 0 is a validation error,
    // so "auto" has to be an absent field rather than a zero.
    const requested = Number(durationSeconds);
    if (Number.isFinite(requested) && requested > 0) {
      payload.duration_seconds = num(requested, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS, 5);
    }

    const format = outputFormat === 'pcm_44100' ? 'pcm_44100' : 'mp3_44100_128';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/sound-generation?output_format=${format}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs sound-generation error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Sound effect generation failed'), 502);
    }

    return audioResponse(
      await response.arrayBuffer(),
      format === 'pcm_44100' ? 'audio/wav' : 'audio/mpeg',
    );
  } catch (err) {
    console.error('elevenlabs-sound-effects error:', err);
    return errorResponse('Internal server error', 500);
  }
});
