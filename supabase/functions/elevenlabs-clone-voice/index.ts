const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const walletAddress = req.headers.get('x-wallet-address');
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formData = await req.formData();
    const name = formData.get('name') as string;
    const file = formData.get('file') as File;

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
    cloneFormData.append('description', `Custom voice cloned by ${walletAddress}`);

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: cloneFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs clone error:', response.status, errText);
      return new Response(
        JSON.stringify({ error: 'Voice cloning failed. Ensure audio is clear and at least 10 seconds.' }),
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
