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

const FALLBACK_MARKET_CAPS: Record<string, number> = {
  GOLD: 22.5e12,
  SILVER: 1.9e12,
  OIL: 3.4e12,
  NATGAS: 0.3e12,
  COPPER: 0.4e12,
  PLATINUM: 0.05e12,
  AAPL: 3.0e12,
  MSFT: 3.1e12,
  NVDA: 3.4e12,
  GOOGL: 2.2e12,
  AMZN: 2.0e12,
  META: 1.6e12,
  TSLA: 1.1e12,
  'BRK.B': 1.1e12,
  TSM: 0.9e12,
  AVGO: 0.8e12,
  LLY: 0.75e12,
  WMT: 0.65e12,
  JPM: 0.7e12,
  V: 0.6e12,
  MA: 0.45e12,
  UNH: 0.5e12,
  XOM: 0.45e12,
  JNJ: 0.38e12,
  PG: 0.4e12,
  HD: 0.38e12,
  COST: 0.4e12,
  NFLX: 0.35e12,
  ORCL: 0.35e12,
  CRM: 0.28e12,
  AMD: 0.25e12,
  PEP: 0.22e12,
  KO: 0.27e12,
  INTC: 0.1e12,
  BA: 0.12e12,
};

async function fetchQuote(symbol: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  const [chartResult, quoteResult] = await Promise.allSettled([
    fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    fetch(quoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
  ]);

  let price: number | null = null;
  let previousClose: number | null = null;
  let marketCap: number | null = null;
  let volume: number | null = null;
  let currency = 'USD';

  if (chartResult.status === 'fulfilled' && chartResult.value.ok) {
    try {
      const data = await chartResult.value.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        price = meta.regularMarketPrice ?? null;
        previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
        currency = meta.currency || 'USD';
      }
    } catch {
      // ignore parse errors
    }
  }

  if (quoteResult.status === 'fulfilled' && quoteResult.value.ok) {
    try {
      const quoteData = await quoteResult.value.json();
      const q = quoteData?.quoteResponse?.result?.[0];
      if (q) {
        price = price ?? q.regularMarketPrice ?? null;
        previousClose = previousClose ?? q.regularMarketPreviousClose ?? null;
        marketCap = q.marketCap ?? null;
        volume = q.regularMarketVolume ?? null;
        currency = q.currency || currency;
      }
    } catch {
      // ignore parse errors
    }
  }

  const change24h = price != null && previousClose != null && previousClose !== 0
    ? ((price - previousClose) / previousClose) * 100
    : null;

  return { price, change24h, marketCap, volume, currency };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const results = await Promise.allSettled(
      TOP_ASSETS.map(async (asset) => {
        const q = await fetchQuote(asset.symbol);
        return {
          symbol: asset.displaySymbol,
          name: asset.name,
          type: asset.type,
          price: q.price,
          change24h: q.change24h,
          marketCap: q.marketCap ?? FALLBACK_MARKET_CAPS[asset.displaySymbol] ?? null,
          volume24h: q.volume,
          currency: q.currency,
        };
      })
    );

    const assets = results.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      return result.value.price != null || result.value.marketCap != null ? [result.value] : [];
    });

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
