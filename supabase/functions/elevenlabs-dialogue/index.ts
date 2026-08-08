/**
 * Text to dialogue — a multi-speaker scene in one pass.
 *
 * Not the same thing as looping the TTS endpoint per line and concatenating.
 * The model reads the whole exchange at once, so speakers react to each other:
 * timing, overlap and the emotional arc across the turns are what this buys,
 * and none of it survives line-by-line synthesis.
 *
 * v3 only — no other model accepts a multi-speaker input.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  num,
  readProviderError,
} from '../_shared/elevenlabs.ts';

const MAX_LINES = 50;
const MAX_TOTAL_CHARS = 5000;

interface DialogueInput {
  text?: unknown;
  voiceId?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { inputs, outputFormat, voiceSettings, seed } = (await req.json()) ?? {};

    if (!Array.isArray(inputs) || inputs.length === 0) {
      return errorResponse('At least one line of dialogue is required');
    }
    if (inputs.length > MAX_LINES) {
      return errorResponse(`A scene can be at most ${MAX_LINES} lines`);
    }

    const lines = (inputs as DialogueInput[]).map((line) => ({
      text: typeof line.text === 'string' ? line.text : '',
      voice_id: typeof line.voiceId === 'string' ? line.voiceId : '',
    }));

    if (lines.some((l) => !l.text || !l.voice_id)) {
      return errorResponse('Every line needs both text and a voice');
    }

    const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return errorResponse(`A scene can be at most ${MAX_TOTAL_CHARS} characters in total`);
    }

    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    const format = outputFormat === 'pcm_44100' ? 'pcm_44100' : 'mp3_44100_128';

    const payload: Record<string, unknown> = {
      inputs: lines,
      model_id: 'eleven_v3',
      settings: {
        stability: num(voiceSettings?.stability, 0, 1, 0.5),
        similarity_boost: num(voiceSettings?.similarity, 0, 1, 0.75),
        use_speaker_boost: voiceSettings?.speakerBoost !== false,
      },
    };
    if (Number.isInteger(seed)) payload.seed = seed;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-dialogue?output_format=${format}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs dialogue error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Dialogue generation failed'), 502);
    }

    return audioResponse(
      await response.arrayBuffer(),
      format === 'pcm_44100' ? 'audio/wav' : 'audio/mpeg',
    );
  } catch (err) {
    console.error('elevenlabs-dialogue error:', err);
    return errorResponse('Internal server error', 500);
  }
});
