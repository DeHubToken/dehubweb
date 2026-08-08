/**
 * Speech to text (Scribe).
 *
 * The one audio task that returns text rather than audio, so it answers with
 * JSON: the transcript, plus the speaker-labelled segments when diarisation is
 * on.
 *
 * transcribe-stage already calls this same upstream endpoint, but it is welded
 * to an ended Stage's recording — it fetches the recording itself, writes rows
 * back and summarises. This one just transcribes whatever it is handed.
 */
import {
  corsHeaders,
  errorResponse,
  getApiKey,
  jsonResponse,
  readProviderError,
  readUpload,
} from '../_shared/elevenlabs.ts';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

interface Word {
  text?: string;
  start?: number;
  end?: number;
  type?: string;
  speaker_id?: string;
}

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
    outbound.append('file', file, file.name || 'input.mp3');
    outbound.append('model_id', 'scribe_v2');
    outbound.append('diarize', String(form.get('diarize') !== 'false'));
    // Laughter, applause and the like, tagged inline where they happen. Free,
    // and it is most of what makes a raw transcript readable as a scene.
    outbound.append('tag_audio_events', String(form.get('tagAudioEvents') !== 'false'));
    outbound.append('timestamps_granularity', 'word');

    const languageCode = form.get('languageCode');
    if (typeof languageCode === 'string' && languageCode) {
      outbound.append('language_code', languageCode);
    }

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: outbound,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs transcribe error:', response.status, errText);
      return errorResponse(readProviderError(errText, 'Transcription failed'), 502);
    }

    const data = await response.json();
    const words: Word[] = Array.isArray(data.words) ? data.words : [];

    return jsonResponse({
      text: data.text ?? '',
      languageCode: data.language_code ?? null,
      languageProbability: data.language_probability ?? null,
      segments: groupBySpeaker(words),
    });
  } catch (err) {
    console.error('elevenlabs-transcribe error:', err);
    return errorResponse('Internal server error', 500);
  }
});

/**
 * Collapse the word list into one block per speaker turn.
 *
 * Scribe returns per-word rows with a speaker id on each. Handing thousands of
 * those to the client and asking it to group them would mean shipping a large
 * payload to rebuild something this already knows; a turn-level transcript is
 * what actually gets read, and it is a fraction of the size.
 *
 * Spacing words are skipped for the speaker check — they carry no speaker id,
 * and treating one as a change of speaker split every turn in half.
 */
function groupBySpeaker(words: Word[]): { speaker: string | null; text: string; start: number | null }[] {
  const segments: { speaker: string | null; text: string; start: number | null }[] = [];
  let current: { speaker: string | null; text: string; start: number | null } | null = null;

  for (const word of words) {
    const text = word.text ?? '';
    if (word.type === 'spacing') {
      if (current) current.text += text;
      continue;
    }
    const speaker = word.speaker_id ?? null;
    if (!current || current.speaker !== speaker) {
      if (current) segments.push({ ...current, text: current.text.trim() });
      current = { speaker, text, start: word.start ?? null };
    } else {
      current.text += text;
    }
  }
  if (current) segments.push({ ...current, text: current.text.trim() });

  return segments.filter((s) => s.text.length > 0);
}
