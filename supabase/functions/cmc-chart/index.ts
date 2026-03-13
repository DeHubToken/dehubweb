import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function downsample(points: { time: number; price: number }[], max = 60) {
  if (points.length <= max) return points;
  const step = Math.max(1, Math.floor(points.length / max));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
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

    const { symbol, days } = await req.json();
    if (!symbol || !days) {
      return new Response(JSON.stringify({ error: 'symbol and days required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clean = symbol.replace(/^\$/, '').toUpperCase();
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400 * 1000);

    const interval = days <= 7 ? 'hourly' : 'daily';

    const params = new URLSearchParams({
      symbol: clean,
      time_start: start.toISOString().split('T')[0],
      time_end: now.toISOString().split('T')[0],
      interval,
      convert: 'USD',
    });

    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/ohlcv/historical?${params}`;

    const res = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `CMC API error: ${res.status}`, details: text }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    // v2 returns data keyed by symbol, e.g. data.data["BTC"][0].quotes
    const symbolData = data.data?.[clean];
    if (!symbolData || !Array.isArray(symbolData) || symbolData.length === 0) {
      return new Response(JSON.stringify({ prices: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Take the first match (most relevant by market cap)
    const quotes = symbolData[0]?.quotes;
    if (!quotes || !Array.isArray(quotes)) {
      return new Response(JSON.stringify({ prices: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const points = quotes.map((q: any) => ({
      time: new Date(q.time_close || q.time_open).getTime(),
      price: q.quote?.USD?.close ?? q.quote?.USD?.open ?? 0,
    }));

    return new Response(JSON.stringify({ prices: downsample(points) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
