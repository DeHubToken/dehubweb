/** Shared stock speech for stages. Custom voices keep their existing route. */
import { serviceClient } from './auth.ts';

const ENDPOINT = 'https://texttospeech.googleapis.com/v1';
export const chirpConfigured = () => !!Deno.env.get('GOOGLE_TTS_API_KEY');
export const isChirpVoice = (id: string) => /^[a-z]{2,3}-[A-Z]{2}-Chirp3-HD-[A-Za-z]+$/.test(id);
type Voice = { name: string; languageCodes: string[]; ssmlGender: string };
let catalogue: { voices: Voice[]; expires: number } | null = null;

function googleHeaders() {
  return { 'Content-Type': 'application/json', 'X-Goog-Api-Key': Deno.env.get('GOOGLE_TTS_API_KEY')! };
}

export async function chirpVoices(language: string, search: string) {
  if (!catalogue || catalogue.expires < Date.now()) {
    const response = await fetch(`${ENDPOINT}/voices`, { headers: googleHeaders(), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Speech voice catalogue unavailable (${response.status})`);
    const body = await response.json();
    catalogue = {
      voices: (body.voices ?? []).filter((v: Voice) => isChirpVoice(v.name)),
      expires: Date.now() + 15 * 60 * 1000,
    };
  }
  const base = language.toLowerCase().split(/[-_]/)[0];
  const exact = catalogue.voices.filter((v) => v.languageCodes.some((l) => l.toLowerCase() === language.toLowerCase()));
  const matching = exact.length ? exact : catalogue.voices.filter((v) => v.languageCodes.some((l) => l.split('-')[0] === base));
  const voices = matching.length ? matching : catalogue.voices.filter((v) => v.languageCodes.includes('en-US'));
  return voices.map((v) => ({
    voice_id: v.name,
    name: v.name.split('-').at(-1)!,
    description: 'Natural speech',
    labels: { gender: v.ssmlGender.toLowerCase(), accent: v.languageCodes[0] },
    preview_url: null,
  })).filter((v) => !search || `${v.name} ${v.labels.accent} ${v.labels.gender}`.toLowerCase().includes(search.toLowerCase()));
}

export async function synthesizeChirp(text: string, voiceId: string, cors: Record<string, string>): Promise<Response> {
  const fail = (error: string, status: number) => new Response(JSON.stringify({ error }), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'X-TTS-Provider': 'google-chirp3-hd' },
  });
  if (!chirpConfigured()) return fail('Stage speech is being configured. Please try again later.', 503);
  if (!isChirpVoice(voiceId) || new TextEncoder().encode(text).length > 5000) return fail('Speech text or voice is invalid.', 400);
  // Reserve before sending. Concurrent requests cannot exceed the shared cap;
  // failed/uncertain provider calls retain their reservation rather than retry.
  const { data: allowed, error } = await serviceClient().rpc('reserve_chirp_characters', { p_characters: Array.from(text).length });
  if (error) return fail('Speech usage check is unavailable. Please try again later.', 503);
  if (!allowed) return fail('The monthly free speech allowance has been used. It resets next month.', 429);
  const response = await fetch(`${ENDPOINT}/text:synthesize`, {
    method: 'POST', headers: googleHeaders(), signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ input: { text }, voice: { languageCode: voiceId.split('-').slice(0, 2).join('-'), name: voiceId }, audioConfig: { audioEncoding: 'MP3' } }),
  });
  if (!response.ok) {
    console.error('google-chirp3-hd synthesis failed', response.status);
    return fail('Speech generation failed. Please try again later.', 502);
  }
  const { audioContent } = await response.json();
  if (typeof audioContent !== 'string' || !audioContent) return fail('Speech generation returned no audio.', 502);
  const audio = Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0));
  return new Response(audio, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'X-TTS-Provider': 'google-chirp3-hd', 'Cache-Control': 'no-store' } });
}
