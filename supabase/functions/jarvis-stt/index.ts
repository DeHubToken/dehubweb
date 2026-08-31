/**
 * Jarvis speech-to-text proxy.
 *
 * Accepts a raw WAV audio body, forwards it to ElevenLabs speech-to-text,
 * and returns the provider's JSON response verbatim.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer, x-jarvis-stt-secret',
};

const MAX_BYTES = 3 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const secret = req.headers.get('x-jarvis-stt-secret');
  const expected = Deno.env.get('CDN_PURGE_SERVICE_SECRET');
  if (!secret || !expected || secret !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'empty body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (audio.byteLength > MAX_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: 'payload too large' }), {
      status: 413,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'elevenlabs not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
    form.append('model_id', 'scribe_v1');
    form.append('language_code', 'en');
    form.append('tag_audio_events', 'false');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs STT error:', response.status);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'elevenlabs',
          status: response.status,
          body: errText.slice(0, 200),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await response.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('jarvis-stt error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
