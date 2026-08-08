/**
 * Voice design — invent a voice from a written description.
 *
 * Two actions on one function, because they are two halves of one interaction:
 *
 *   'design'  describe a voice, get three takes back as base64 previews
 *   'save'    keep one of those takes as a real voice on the account
 *
 * Only 'save' costs the account a voice slot, which is why designing is free to
 * repeat until one of them sounds right.
 *
 * The custom_voices row is written by the CLIENT after this returns, exactly as
 * elevenlabs-clone-voice does it — that table is reached with the wallet header
 * from the browser and this function has no wallet-scoped client to write it
 * with.
 */
import {
  corsHeaders,
  errorResponse,
  getApiKey,
  jsonResponse,
  readProviderError,
} from '../_shared/elevenlabs.ts';

const MAX_DESCRIPTION_CHARS = 1000;
/** The provider requires a description with enough in it to work from. */
const MIN_DESCRIPTION_CHARS = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) ?? {};
    const action = body.action === 'save' ? 'save' : 'design';

    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    if (action === 'save') {
      const { generatedVoiceId, name, description } = body;
      if (!generatedVoiceId || typeof generatedVoiceId !== 'string') {
        return errorResponse('generatedVoiceId is required');
      }
      if (!name || typeof name !== 'string' || name.length < 1 || name.length > 50) {
        return errorResponse('Name must be 1-50 characters');
      }

      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_name: name,
          voice_description:
            typeof description === 'string' && description ? description : `Designed voice: ${name}`,
          generated_voice_id: generatedVoiceId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('ElevenLabs voice save error:', response.status, errText);
        return errorResponse(readProviderError(errText, 'Could not save that voice'), 502);
      }

      const data = await response.json();
      return jsonResponse({ voiceId: data.voice_id, name: data.name ?? name });
    }

    const { description, previewText } = body;
    if (
      !description ||
      typeof description !== 'string' ||
      description.length < MIN_DESCRIPTION_CHARS ||
      description.length > MAX_DESCRIPTION_CHARS
    ) {
      return errorResponse(
        `Describe the voice in ${MIN_DESCRIPTION_CHARS}-${MAX_DESCRIPTION_CHARS} characters`,
      );
    }

    const payload: Record<string, unknown> = {
      voice_description: description,
      model_id: 'eleven_ttv_v3',
    };

    // The sample line the previews read. Left out, the provider writes one that
    // suits the description — which is usually a better demo than a generic
    // sentence, so this is only sent when the creator actually typed one.
    const text = typeof previewText === 'string' ? previewText.trim() : '';
    if (text.length >= 100) {
      payload.text = text;
    } else {
      payload.auto_generate_text = true;
    }

    const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs voice design error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Voice design failed'), 502);
    }

    const data = await response.json();
    const previews = Array.isArray(data.previews) ? data.previews : [];

    return jsonResponse({
      previews: previews.map((p: Record<string, unknown>) => ({
        generatedVoiceId: p.generated_voice_id,
        // Base64 rather than a URL: these takes are not persisted anywhere at
        // the provider until one is saved, so there is nothing to link to.
        audioBase64: p.audio_base_64,
        mediaType: p.media_type ?? 'audio/mpeg',
        durationSecs: p.duration_secs ?? null,
      })),
      text: data.text ?? null,
    });
  } catch (err) {
    console.error('elevenlabs-voice-design error:', err);
    return errorResponse('Internal server error', 500);
  }
});
