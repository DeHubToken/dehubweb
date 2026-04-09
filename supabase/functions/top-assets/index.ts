const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TOP_ASSETS = [
  // Commodities
  { symbol: 'GC=F', name: 'Gold', displaySymbol: 'GOLD', type: 'commodity' },
  { symbol: 'SI=F', name: 'Silver', displaySymbol: 'SILVER', type: 'commodity' },
  { symbol: 'CL=F', name: 'Crude Oil (WTI)', displaySymbol: 'OIL', type: 'commodity' },
  { symbol: 'NG=F', name: 'Natural Gas', displaySymbol: 'NATGAS', type: 'commodity' },
  { symbol: 'HG=F', name: 'Copper', displaySymbol: 'COPPER', type: 'commodity' },
  { symbol: 'PL=F', name: 'Platinum', displaySymbol: 'PLATINUM', type: 'commodity' },
  // Mega-cap stocks
  { symbol: 'AAPL', name: 'Apple', displaySymbol: 'AAPL', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', displaySymbol: 'MSFT', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', displaySymbol: 'NVDA', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', displaySymbol: 'GOOGL', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', displaySymbol: 'AMZN', type: 'stock' },
  { symbol: 'META', name: 'Meta', displaySymbol: 'META', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', displaySymbol: 'TSLA', type: 'stock' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', displaySymbol: 'BRK.B', type: 'stock' },
  { symbol: 'TSM', name: 'TSMC', displaySymbol: 'TSM', type: 'stock' },
  { symbol: 'AVGO', name: 'Broadcom', displaySymbol: 'AVGO', type: 'stock' },
  { symbol: 'LLY', name: 'Eli Lilly', displaySymbol: 'LLY', type: 'stock' },
  { symbol: 'WMT', name: 'Walmart', displaySymbol: 'WMT', type: 'stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase', displaySymbol: 'JPM', type: 'stock' },
  { symbol: 'V', name: 'Visa', displaySymbol: 'V', type: 'stock' },
  { symbol: 'MA', name: 'Mastercard', displaySymbol: 'MA', type: 'stock' },
  { symbol: 'UNH', name: 'UnitedHealth', displaySymbol: 'UNH', type: 'stock' },
  { symbol: 'XOM', name: 'ExxonMobil', displaySymbol: 'XOM', type: 'stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', displaySymbol: 'JNJ', type: 'stock' },
  { symbol: 'PG', name: 'Procter & Gamble', displaySymbol: 'PG', type: 'stock' },
  { symbol: 'HD', name: 'Home Depot', displaySymbol: 'HD', type: 'stock' },
  { symbol: 'COST', name: 'Costco', displaySymbol: 'COST', type: 'stock' },
  { symbol: 'NFLX', name: 'Netflix', displaySymbol: 'NFLX', type: 'stock' },
  { symbol: 'ORCL', name: 'Oracle', displaySymbol: 'ORCL', type: 'stock' },
  { symbol: 'CRM', name: 'Salesforce', displaySymbol: 'CRM', type: 'stock' },
  { symbol: 'AMD', name: 'AMD', displaySymbol: 'AMD', type: 'stock' },
  { symbol: 'PEP', name: 'PepsiCo', displaySymbol: 'PEP', type: 'stock' },
  { symbol: 'KO', name: 'Coca-Cola', displaySymbol: 'KO', type: 'stock' },
  { symbol: 'INTC', name: 'Intel', displaySymbol: 'INTC', type: 'stock' },
  { symbol: 'BA', name: 'Boeing', displaySymbol: 'BA', type: 'stock' },
];

async function fetchQuote(symbol: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  const [chartRes, quoteRes] = await Promise.all([
    fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    fetch(quoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
  ]);

  let price: number | null = null;
  let previousClose: number | null = null;
  let marketCap: number | null = null;
  let volume: number | null = null;
  let currency = 'USD';

  if (chartRes.ok) {
    const data = await chartRes.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta) {
      price = meta.regularMarketPrice ?? null;
      previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
      currency = meta.currency || 'USD';
    }
  } else {
    await chartRes.text();
  }

  try {
    if (quoteRes.ok) {
      const qd = await quoteRes.json();
      const q = qd?.quoteResponse?.result?.[0];
      if (q) {
        if (!price) price = q.regularMarketPrice ?? null;
        if (!previousClose) previousClose = q.regularMarketPreviousClose ?? null;
        marketCap = q.marketCap ?? null;
        volume = q.regularMarketVolume ?? null;
        currency = q.currency || currency;
      }
    } else {
      await quoteRes.text();
    }
  } catch { /* ignore */ }

  const change24h = price && previousClose ? ((price - previousClose) / previousClose) * 100 : null;

  return { price, change24h, marketCap, volume, currency };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch all in parallel
    const results = await Promise.all(
      TOP_ASSETS.map(async (asset) => {
        try {
          const q = await fetchQuote(asset.symbol);
          if (!q.price) return null;
          return {
            symbol: asset.displaySymbol,
            name: asset.name,
            type: asset.type,
            price: q.price,
            change24h: q.change24h,
            marketCap: q.marketCap,
            volume24h: q.volume,
            currency: q.currency,
          };
        } catch {
          return null;
        }
      })
    );

    const assets = results.filter(Boolean);

    return new Response(JSON.stringify({ assets }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ assets: [], error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
