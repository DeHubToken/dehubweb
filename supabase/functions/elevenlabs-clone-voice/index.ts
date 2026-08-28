/**
 * Clone a voice from an uploaded sample.
 *
 * Cloning takes a VOICE SLOT, and the plan holds a fixed number of those for as
 * long as the voice exists — so the scarce resource here is not really money,
 * it is the ability to make another one at all. Exhausting the slots takes
 * stage dubbing down with it.
 *
 * This used to gate on the presence of an `x-wallet-address` header, which is a
 * string the caller picks. _shared/auth.ts has the long version of why that is
 * not authentication; the short version is that anyone could burn slots and
 * every clone was attributed to whoever they said they were.
 */
import { chargeForJob } from '../_shared/ai-payment-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // The wallet now comes off the verified token rather than off a header the
    // caller wrote. Not priced yet: stage-voice-clone charges `voice-clone` and
    // caches the result per wallet so a repeat clone is not a repeat slot, and
    // this path should adopt that same caching before it starts charging —
    // otherwise it bills a second time for a voice the account already holds.
    const charged = await chargeForJob(req, {
      kind: 'tool',
      modelId: 'voice-clone',
      actionType: 'elevenlabs-clone-voice',
      rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 },
      free: true,
    });
    if (!charged.ok) return charged.response;
    const walletAddress = charged.wallet;

    const formData = await req.formData();
    const name = formData.get('name') as string;
    const file = formData.get('file') as File;
    const customApiKey = formData.get('customApiKey') as string | null;

    // Use custom API key if provided, otherwise fall back to server key
    const apiKey = customApiKey || Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Name must be 1-50 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'Audio file is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Forward to ElevenLabs voice cloning API
    const cloneFormData = new FormData();
    cloneFormData.append('name', name);
    cloneFormData.append('files', file, file.name || 'sample.webm');
    // No wallet in the description. Ownership is recorded in custom_voices,
    // nothing reads this string back, and the provider's own voice list is
    // reachable from the app — so putting an address in here published it.
    cloneFormData.append('description', 'DeHub custom voice');

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: cloneFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs clone error:', response.status, errText);
      const isInvalidKey = response.status === 401 || response.status === 403;
      return new Response(
        JSON.stringify({ 
          error: isInvalidKey 
            ? 'Invalid ElevenLabs API key. Please check your key and try again.' 
            : 'Voice cloning failed. Ensure audio is clear and at least 10 seconds.' 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ voice_id: data.voice_id, name: data.name || name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('elevenlabs-clone-voice error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
