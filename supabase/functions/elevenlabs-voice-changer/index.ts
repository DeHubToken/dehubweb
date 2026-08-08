/**
 * Voice changer (speech to speech).
 *
 * Re-performs an uploaded recording in a different voice, keeping the original
 * delivery, timing and emotion. Multipart in, raw audio out.
 *
 * Paid: the client settles DHB before calling this, so an upload the provider
 * would reject has to be caught in the composer while it is still free.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
  num,
  readProviderError,
  readUpload,
} from '../_shared/elevenlabs.ts';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = getApiKey();
    if (!apiKey) return errorResponse('ElevenLabs API key not configured', 500);

    const upload = await readUpload(req);
    if (!upload) return errorResponse('An audio file is required');
    const { file, form } = upload;

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse('That recording is over 100 MB. Use a shorter or smaller file.');
    }

    const voiceId = form.get('voiceId');
    if (!voiceId || typeof voiceId !== 'string') {
      return errorResponse('voiceId is required');
    }

    const outbound = new FormData();
    outbound.append('audio', file, file.name || 'input.mp3');
    outbound.append('model_id', 'eleven_multilingual_sts_v2');
    // Noise removal defaults ON. A phone recording with room tone behind it is
    // the common case, and the tone is otherwise re-performed as part of the
    // take rather than stripped.
    outbound.append('remove_background_noise', String(form.get('removeNoise') !== 'false'));

    const settings = {
      stability: num(form.get('stability'), 0, 1, 0.5),
      similarity_boost: num(form.get('similarity'), 0, 1, 0.75),
      style: num(form.get('style'), 0, 1, 0),
      use_speaker_boost: form.get('speakerBoost') !== 'false',
    };
    outbound.append('voice_settings', JSON.stringify(settings));

    const format = form.get('outputFormat') === 'pcm_44100' ? 'pcm_44100' : 'mp3_44100_128';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=${format}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: outbound,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs voice-changer error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Voice conversion failed'), 502);
    }

    return audioResponse(
      await response.arrayBuffer(),
      format === 'pcm_44100' ? 'audio/wav' : 'audio/mpeg',
    );
  } catch (err) {
    console.error('elevenlabs-voice-changer error:', err);
    return errorResponse('Internal server error', 500);
  }
});
