/**
 * The voices a caller may pick from.
 *
 * Deliberately still callable without signing in — the stock library is not
 * private and the pickers render before auth — but NOT the whole account any
 * more. This used to return every voice on the key, which meant a stranger got
 * back other people's cloned voices, their ids, and the wallet address that was
 * being written into the provider-side description.
 *
 * That is worse than an information leak on its own: elevenlabs-dialogue and
 * elevenlabs-voice-changer both take a voiceId, so a listed clone is a voice
 * anyone can then perform with. Handing out the id is handing out the voice.
 *
 * So: stock voices for everyone, a caller's own clones for that caller, and
 * nobody else's ever.
 */
import { rateLimitByIp, resolveDeHubAddress, serviceClient } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

/**
 * Categories the provider assigns to a voice somebody made. Anything in one of
 * these has to be owned to be shown; `premade` and an absent category are the
 * shared library and stay visible.
 */
const PERSONAL_CATEGORIES = new Set(['cloned', 'generated', 'professional']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Open endpoints get an IP limit rather than a wallet one — there is no
  // wallet to key on when nobody is signed in.
  const limited = await rateLimitByIp(req, 'elevenlabs-voices', {
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    // Clamped: this rode straight through to the provider, so a caller could
    // ask for an arbitrarily large page. The pickers ask for 100 at most.
    const requestedSize = Number(url.searchParams.get('page_size'));
    const pageSize = Number.isFinite(requestedSize)
      ? Math.min(100, Math.max(1, Math.floor(requestedSize)))
      : 30;

    const apiUrl = new URL('https://api.elevenlabs.io/v2/voices');
    if (search) apiUrl.searchParams.set('search', search);
    apiUrl.searchParams.set('page_size', String(pageSize));

    const response = await fetch(apiUrl.toString(), {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs voices error:', response.status, errText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch voices' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Who is asking, if anyone. An absent or stale token is not an error here:
    // it just means the caller sees the stock library and none of the clones.
    const token = req.headers.get('x-dehub-token') || '';
    const wallet = token ? await resolveDeHubAddress(token) : null;

    // Two sets, because a voice can be personal in two different ways. The
    // registered ones are the clones DeHub knows the owner of; the category
    // check catches the rest, including the orphans an older clone path made
    // and never recorded.
    const returned: string[] = (data.voices || [])
      .map((v: any) => String(v.voice_id ?? ''))
      .filter(Boolean);

    const ownIds = new Set<string>();
    const claimedIds = new Set<string>();
    try {
      // Scoped to the ids actually on this page. Reading the whole table would
      // grow into a full scan on every picker open for no extra answer.
      const { data: rows } = await serviceClient()
        .from('custom_voices')
        .select('elevenlabs_voice_id, wallet_address')
        .in('elevenlabs_voice_id', returned);
      for (const row of rows ?? []) {
        const id = String(row.elevenlabs_voice_id ?? '');
        if (!id) continue;
        claimedIds.add(id);
        if (wallet && String(row.wallet_address ?? '').toLowerCase() === wallet) ownIds.add(id);
      }
    } catch (err) {
      // Fail CLOSED, unlike the rate limiter. Losing this lookup means not
      // knowing who owns what, and the safe answer to that is the stock
      // library rather than everybody's voices.
      console.error('elevenlabs-voices: could not read custom_voices', err);
    }

    const voices = (data.voices || [])
      .filter((v: any) => {
        const id = String(v.voice_id ?? '');
        if (ownIds.has(id)) return true;
        if (claimedIds.has(id)) return false;
        return !PERSONAL_CATEGORIES.has(String(v.category ?? ''));
      })
      // Slim down the response to only what the client needs
      .map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        description: v.description || '',
        labels: v.labels || {},
        preview_url: v.preview_url || null,
      }));

    return new Response(JSON.stringify({ voices }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('elevenlabs-voices error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
