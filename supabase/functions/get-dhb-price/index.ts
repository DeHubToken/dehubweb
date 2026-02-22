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
    // Fetch prices for all wallet tokens from CoinGecko
    const ids = 'dehub,ethereum,binancecoin,tether';
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    // Map CoinGecko IDs to token symbols
    const prices: Record<string, number> = {
      DHB: data.dehub?.usd ?? 0,
      ETH: data.ethereum?.usd ?? 0,
      WETH: data.ethereum?.usd ?? 0,
      BNB: data.binancecoin?.usd ?? 0,
      WBNB: data.binancecoin?.usd ?? 0,
      USDT: data.tether?.usd ?? 1,
    };

    console.log('Token prices fetched:', prices);

    return new Response(
      JSON.stringify({
        prices,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching token prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
