/**
 * Audio isolation — pull the voice cleanly out of a noisy recording.
 *
 * Multipart in, raw audio out. Free, and the natural first step before dubbing
 * or the voice changer: both of those re-perform whatever is in the file, room
 * tone included, so cleaning first measurably improves them.
 */
import {
  audioResponse,
  corsHeaders,
  errorResponse,
  getApiKey,
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
    if (!upload) return errorResponse('An audio or video file is required');
    const { file, form } = upload;

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorResponse('That file is over 100 MB. Use a shorter or smaller one.');
    }

    const outbound = new FormData();
    outbound.append('audio', file, file.name || 'input.mp3');

    const format = form.get('outputFormat') === 'pcm_44100' ? 'pcm_44100' : 'mp3_44100_128';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/audio-isolation?output_format=${format}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: outbound,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs audio-isolation error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Could not clean that recording'), 502);
    }

    return audioResponse(
      await response.arrayBuffer(),
      format === 'pcm_44100' ? 'audio/wav' : 'audio/mpeg',
    );
  } catch (err) {
    console.error('elevenlabs-audio-isolation error:', err);
    return errorResponse('Internal server error', 500);
  }
});
