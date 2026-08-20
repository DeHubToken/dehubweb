// Speak one finished line, in every language somebody has paid to hear it in.
//
// Called by a SPEAKER's client, spending money a LISTENER put in. That split is
// the whole reason the entitlement token exists: the caller is not the payer,
// so the request has to carry proof that the language it asks for is paid up.
// See _shared/dub-entitlement.ts.
//
// Two guards, and both are needed. The seat check stops a stranger driving our
// text-to-speech through a public function; the entitlement check stops a
// seated speaker generating languages nobody bought. Neither alone is enough.
import { handleCorsPreflight, jsonResponse, serviceClient, guardPaidEndpoint } from '../_shared/auth.ts';
import { verifyEntitlement } from '../_shared/dub-entitlement.ts';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';

/**
 * Flash, not the standard model. It is built for real-time use and costs half
 * as much per character; on a pipeline already running seconds behind the room,
 * generation latency is the one part still worth optimising.
 */
const TTS_MODEL = 'eleven_flash_v2_5';
/**
 * 32 kbps mono MP3. Speech at conversational bitrate, roughly 4 KB a second —
 * small enough that a clip rides a Realtime broadcast frame without splitting.
 */
const OUTPUT_FORMAT = 'mp3_22050_32';
/** Stock voice for a stage whose host has not trained one. */
const FALLBACK_VOICE_ID = Deno.env.get('DUB_FALLBACK_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';

/** Longest line worth speaking. Live utterances run far under this. */
const MAX_TEXT_CHARS = 600;
/** Languages one request may cover — the picker offers fourteen. */
const MAX_ITEMS = 14;

interface DubItem {
  lang: string;
  text: string;
  token: string;
}

/** Same seat check as the caption functions: only someone who can talk can dub. */
async function maySpeak(stageId: string, wallet: string): Promise<boolean> {
  const admin = serviceClient();
  const { data: stage } = await admin
    .from('audio_spaces')
    .select('id, host_wallet_address')
    .eq('id', stageId)
    .maybeSingle();
  if (!stage) return false;
  if ((stage.host_wallet_address || '').toLowerCase() === wallet) return true;

  const { data: seat } = await admin
    .from('space_participants')
    .select('role')
    .eq('space_id', stage.id)
    .ilike('wallet_address', wallet)
    .is('left_at', null)
    .maybeSingle();
  return seat?.role === 'host' || seat?.role === 'speaker';
}

/** The host's cloned voice, or the stock one. Never taken from the request. */
async function resolveVoiceId(stageId: string): Promise<string> {
  const admin = serviceClient();
  const { data: stage } = await admin
    .from('audio_spaces')
    .select('host_wallet_address')
    .eq('id', stageId)
    .maybeSingle();
  const hostWallet = (stage?.host_wallet_address || '').toLowerCase();
  if (!hostWallet) return FALLBACK_VOICE_ID;

  const { data: voice } = await admin
    .from('custom_voices')
    .select('elevenlabs_voice_id')
    .ilike('wallet_address', hostWallet)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return voice?.elevenlabs_voice_id || FALLBACK_VOICE_ID;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on a clip
  // of any real length.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function speak(text: string, voiceId: string, languageCode: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          language_code: languageCode,
          voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.0 },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[dub-line] tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return toBase64(new Uint8Array(await res.arrayBuffer()));
  } catch (e) {
    console.error('[dub-line] tts failed', e);
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (!ELEVENLABS_API_KEY) {
      console.error('[dub-line] ELEVENLABS_API_KEY is not set');
      return jsonResponse({ error: 'Dubbing is not configured.' }, 500);
    }

    const body = await req.json().catch(() => null);
    const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
    const lineId = typeof body?.lineId === 'string' ? body.lineId : '';
    const items: DubItem[] = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];

    if (!spaceId || !lineId || !items.length) {
      return jsonResponse({ error: 'spaceId, lineId and items are required' }, 400);
    }

    // A busy two-hour stage finalises on the order of 1,300 lines, and this is
    // one request per line however many languages it covers.
    const guard = await guardPaidEndpoint(req, 'dub-line', {
      limit: 4000,
      windowMs: 60 * 60 * 1000,
    });
    if (!guard.ok) return guard.response;

    if (!(await maySpeak(spaceId, guard.wallet))) {
      return jsonResponse({ error: 'Not entitled to dub this stage.' }, 403);
    }

    // Keep only the languages whose token actually verifies for THIS stage and
    // THIS language. An unpaid or replayed-from-another-room token buys nothing.
    const paid: Array<{ lang: string; text: string }> = [];
    for (const item of items) {
      const text = typeof item?.text === 'string' ? item.text.trim().slice(0, MAX_TEXT_CHARS) : '';
      const lang = typeof item?.lang === 'string' ? item.lang : '';
      if (!text || !lang) continue;
      const claims = await verifyEntitlement(String(item?.token ?? ''));
      if (!claims || claims.s !== spaceId || claims.l !== lang) continue;
      if (paid.some((p) => p.lang === lang)) continue;
      paid.push({ lang, text });
    }

    if (!paid.length) {
      // Nobody has paid for any of these languages. Not an error — it is the
      // steady state whenever a listener's block lapses mid-sentence.
      return jsonResponse({ id: lineId, audio: {} });
    }

    const voiceId = await resolveVoiceId(spaceId);

    const results = await Promise.all(
      paid.map(async ({ lang, text }) => [lang, await speak(text, voiceId, lang)] as const),
    );

    const audio: Record<string, string> = {};
    for (const [lang, clip] of results) if (clip) audio[lang] = clip;

    // Partial results ship: a line that spoke in three of four languages is
    // three rooms hearing it and one reading subtitles, which beats silence
    // everywhere.
    return jsonResponse({ id: lineId, audio, format: 'mp3' });
  } catch (e) {
    console.error('[dub-line]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
