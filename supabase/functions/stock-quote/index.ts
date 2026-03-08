const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();
    if (!symbol || typeof symbol !== 'string') {
      return new Response(JSON.stringify({ found: false, error: 'Missing symbol' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clean = symbol.replace(/^\$/, '').toUpperCase().slice(0, 10);

    // Fetch 1-day chart with 5m intervals (includes quote meta)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=1d&interval=5m&includePrePost=false`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Yahoo Finance error:', res.status, text);
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meta = result.meta;
    const exchange = meta.exchangeName || meta.fullExchangeName || '';
    const instrumentType = meta.instrumentType || '';

    // Only accept equity/stock/ETF types from recognized exchanges
    const validTypes = ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'];
    if (!validTypes.includes(instrumentType.toUpperCase())) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const change24h = price && previousClose ? price - previousClose : null;
    const percentChange24h = price && previousClose ? ((price - previousClose) / previousClose) * 100 : null;

    // Build chart data
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const chartData = timestamps.map((t: number, i: number) => ({
      time: t * 1000,
      price: closes[i] ?? null,
    })).filter((p: { time: number; price: number | null }) => p.price !== null);

    // Try to get market cap and volume from quote endpoint
    let marketCap: number | null = null;
    let volume24h: number | null = null;
    let dayHigh: number | null = null;
    let dayLow: number | null = null;
    let longName: string | null = null;

    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(clean)}`;
      const quoteRes = await fetch(quoteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        const q = quoteData?.quoteResponse?.result?.[0];
        if (q) {
          marketCap = q.marketCap ?? null;
          volume24h = q.regularMarketVolume ?? null;
          dayHigh = q.regularMarketDayHigh ?? null;
          dayLow = q.regularMarketDayLow ?? null;
          longName = q.longName ?? q.shortName ?? null;
        }
      } else {
        await quoteRes.text(); // consume body
      }
    } catch (e) {
      console.error('Quote fetch error:', e);
    }

    const payload = {
      found: true,
      name: longName || meta.shortName || meta.symbol || clean,
      symbol: meta.symbol || clean,
      exchange: meta.fullExchangeName || exchange,
      exchangeShort: exchange,
      currency: meta.currency || 'USD',
      instrumentType,
      price,
      change24h,
      percentChange24h,
      previousClose,
      dayHigh,
      dayLow,
      marketCap,
      volume24h,
      chartData,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('stock-quote error:', err);
    return new Response(JSON.stringify({ found: false, error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
