/**
 * Text to speech.
 *
 * Returns a raw audio body, not JSON — the client reads it with fetch and turns
 * it into a Blob, because functions-js only decodes JSON and a couple of binary
 * content types.
 *
 * Extended from the original fixed-voice call: the model, the voice settings,
 * the language and the output format all come from the request now, because the
 * Creator Studio exposes them. Everything is still optional and every default
 * below is what this function used to hard-code, so existing callers — the
 * assistant, the Stage, the editor's voiceover button — are unaffected.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Kept in step with MAX_SPEECH_CHARS in audio-models.constants.ts.
 *
 * The old limit was 500 characters — about three sentences, which made the
 * endpoint useless for the voiceover the studio is actually for. It is still
 * capped, and capped HERE as well as in the composer: the ceiling is what stops
 * a hand-rolled request billing the account for a whole novel.
 */
const MAX_TEXT_CHARS = 5000;

const ALLOWED_MODELS = new Set([
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
]);

const ALLOWED_FORMATS = new Set(['mp3_44100_128', 'mp3_44100_192', 'pcm_44100']);

/** Clamp into range and fall back to `fallback` for anything non-numeric. */
function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      text,
      voiceId,
      modelId,
      languageCode,
      seed,
      outputFormat,
      previousText,
      nextText,
      voiceSettings,
    } = body ?? {};

    if (!text || typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_CHARS) {
      return new Response(
        JSON.stringify({ error: `Text must be 1-${MAX_TEXT_CHARS} characters` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return new Response(JSON.stringify({ error: 'voiceId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'ElevenLabs API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = ALLOWED_MODELS.has(modelId) ? modelId : 'eleven_turbo_v2_5';
    const format = ALLOWED_FORMATS.has(outputFormat) ? outputFormat : 'mp3_44100_128';

    const settings: Record<string, unknown> = {
      stability: num(voiceSettings?.stability, 0, 1, 0.5),
      similarity_boost: num(voiceSettings?.similarity, 0, 1, 0.75),
      style: num(voiceSettings?.style, 0, 1, 0.3),
      use_speaker_boost: voiceSettings?.speakerBoost !== false,
    };
    // v3 paces itself from the tags and the punctuation; sending a speed
    // multiplier alongside it is rejected outright, so it is only ever sent to
    // the models that accept one.
    if (model !== 'eleven_v3' && voiceSettings?.speed !== undefined) {
      settings.speed = num(voiceSettings.speed, 0.7, 1.2, 1.0);
    }

    const payload: Record<string, unknown> = {
      text,
      model_id: model,
      voice_settings: settings,
    };

    // Everything below is an override the caller may legitimately omit, and an
    // explicit null is NOT the same as absent to this API — an empty
    // language_code makes it reject the request rather than auto-detect.
    if (typeof languageCode === 'string' && languageCode) payload.language_code = languageCode;
    if (Number.isInteger(seed)) payload.seed = seed;
    // Continuity hints. Given the surrounding lines, the model matches prosody
    // across a split script instead of resetting its delivery every chunk.
    if (typeof previousText === 'string' && previousText) payload.previous_text = previousText;
    if (typeof nextText === 'string' && nextText) payload.next_text = nextText;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs API error:', response.status, errText);
      // Pass the provider's own message through. "Voice not found" and "quota
      // exceeded" need completely different responses from the creator, and
      // collapsing both into "TTS generation failed" told them nothing.
      return new Response(
        JSON.stringify({ error: readProviderError(errText, 'TTS generation failed') }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': format.startsWith('pcm') ? 'audio/wav' : 'audio/mpeg',
      },
    });
  } catch (err) {
    console.error('elevenlabs-tts error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Pull the human-readable part out of an ElevenLabs error body.
 *
 * Their shape is `{ detail: { message } }` on most endpoints and a bare
 * `{ detail: "..." }` on some, so both are handled; anything unrecognised falls
 * back rather than leaking a raw payload to the UI.
 */
function readProviderError(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof detail?.message === 'string' && detail.message) return detail.message;
    if (typeof parsed?.message === 'string' && parsed.message) return parsed.message;
  } catch {
    /* not JSON */
  }
  return fallback;
}
