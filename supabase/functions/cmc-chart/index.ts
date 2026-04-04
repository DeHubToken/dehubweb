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

function normalizeSymbol(raw: string) {
  return raw.replace(/^\$/, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('CMC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'CMC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const rawSymbol = typeof body?.symbol === 'string' ? body.symbol : '';
    const days = Number(body?.days);

    if (!rawSymbol || !Number.isFinite(days) || days <= 0) {
      return new Response(JSON.stringify({ error: 'symbol and positive numeric days are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clean = normalizeSymbol(rawSymbol);
    if (!clean) {
      return new Response(JSON.stringify({ error: 'Invalid symbol format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const start = new Date(now.getTime() - days * 86400 * 1000);

    const params = new URLSearchParams({
      symbol: clean,
      time_start: start.toISOString().split('T')[0],
      time_end: now.toISOString().split('T')[0],
      interval: 'daily',
      convert: 'USD',
    });

    const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/ohlcv/historical?${params}`;

    const res = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `CMC API error: ${res.status}`, details: text }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    if (data?.status?.error_code && data.status.error_code !== 0) {
      return new Response(JSON.stringify({ error: data.status.error_message || 'CMC response error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbolData = data.data?.[clean];
    if (!symbolData || !Array.isArray(symbolData) || symbolData.length === 0) {
      return new Response(JSON.stringify({ prices: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quotes = symbolData[0]?.quotes;
    if (!quotes || !Array.isArray(quotes)) {
      return new Response(JSON.stringify({ prices: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let points = quotes
      .map((q: any) => ({
        time: new Date(q.time_close || q.time_open).getTime(),
        price: Number(q.quote?.USD?.close ?? q.quote?.USD?.open ?? 0),
      }))
      .filter((p: { time: number; price: number }) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.price > 0);




    return new Response(JSON.stringify({ prices: downsample(points) }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
