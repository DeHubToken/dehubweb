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
    const CMC_API_KEY = Deno.env.get('CMC_API_KEY');
    if (!CMC_API_KEY) {
      return new Response(JSON.stringify({ error: 'CMC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { symbol } = await req.json();
    if (!symbol || typeof symbol !== 'string') {
      return new Response(JSON.stringify({ error: 'symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean symbol (remove $ prefix, uppercase)
    const cleanSymbol = symbol.replace(/^\$/, '').toUpperCase();

    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(cleanSymbol)}&convert=USD`;

    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok || data.status?.error_code) {
      console.error('CMC API error:', data.status?.error_message);
      return new Response(JSON.stringify({ error: data.status?.error_message || 'CMC API error', marketCap: null }), {
        status: 200, // Return 200 so frontend can gracefully fallback
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = data.data?.[cleanSymbol];
    if (!tokenData) {
      return new Response(JSON.stringify({ marketCap: null, symbol: cleanSymbol }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quote = tokenData.quote?.USD;

    return new Response(JSON.stringify({
      symbol: cleanSymbol,
      name: tokenData.name,
      marketCap: quote?.market_cap || null,
      fullyDilutedMarketCap: quote?.fully_diluted_market_cap || null,
      price: quote?.price || null,
      volume24h: quote?.volume_24h || null,
      percentChange24h: quote?.percent_change_24h || null,
      circulatingSupply: tokenData.circulating_supply || null,
      totalSupply: tokenData.total_supply || null,
      cmcRank: tokenData.cmc_rank || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('CMC lookup error:', error);
    return new Response(JSON.stringify({ error: 'Internal error', marketCap: null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
