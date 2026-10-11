import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

/**
 * The listing, held for an hour in module scope so it survives across requests
 * on a warm instance. A listings/latest call at this size costs 25 CMC credits
 * and every visitor to the Top Assets page asked for a fresh one; prices an
 * hour old are fine for a ranking table. A failed refresh keeps serving the
 * last good copy.
 */
let coinsCache: { at: number; coins: unknown[] } | null = null;
let inFlight: Promise<unknown[]> | null = null;
const COINS_TTL_MS = 60 * 60 * 1000;

async function loadCoins(apiKey: string): Promise<unknown[]> {
  if (coinsCache && Date.now() - coinsCache.at < COINS_TTL_MS) return coinsCache.coins;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await fetch(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=5000&convert=USD',
      { headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' } }
    );
    if (!res.ok) {
      const text = await res.text();
      if (coinsCache) return coinsCache.coins;
      throw new Error(`CMC API error: ${res.status} ${text.slice(0, 200)}`);
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
    if (coins.length) coinsCache = { at: Date.now(), coins };
    return coins;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

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

    let coins: unknown[];
    try {
      coins = await loadCoins(apiKey);
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ coins }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
