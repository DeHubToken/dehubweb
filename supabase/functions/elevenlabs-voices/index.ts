const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const pageSize = url.searchParams.get('page_size') || '30';

    const apiUrl = new URL('https://api.elevenlabs.io/v2/voices');
    if (search) apiUrl.searchParams.set('search', search);
    apiUrl.searchParams.set('page_size', pageSize);

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

    // Slim down the response to only what the client needs
    const voices = (data.voices || []).map((v: any) => ({
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
