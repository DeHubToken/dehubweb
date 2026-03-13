import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('CMC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'CMC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=5000&convert=USD',
      { headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' } }
    );

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `CMC API error: ${res.status}`, details: text }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    const coins = (data.data || []).map((c: any) => ({
      rank: c.cmc_rank,
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      price: c.quote?.USD?.price ?? 0,
      percent_change_1h: c.quote?.USD?.percent_change_1h ?? 0,
      percent_change_24h: c.quote?.USD?.percent_change_24h ?? 0,
      percent_change_7d: c.quote?.USD?.percent_change_7d ?? 0,
      market_cap: c.quote?.USD?.market_cap ?? 0,
      volume_24h: c.quote?.USD?.volume_24h ?? 0,
    }));

    return new Response(JSON.stringify({ coins }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
