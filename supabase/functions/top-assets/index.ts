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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const symbols = TOP_ASSETS.map(a => a.symbol).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ assets: [], error: `Yahoo API ${res.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const quotes = data?.quoteResponse?.result ?? [];

    const assets = TOP_ASSETS.map((asset) => {
      const q = quotes.find((r: any) => r.symbol === asset.symbol);
      if (!q) return null;

      return {
        symbol: asset.displaySymbol,
        name: asset.name,
        type: asset.type,
        price: q.regularMarketPrice ?? null,
        change24h: q.regularMarketChangePercent ?? null,
        marketCap: q.marketCap ?? null,
        volume24h: q.regularMarketVolume ?? null,
        currency: q.currency ?? 'USD',
      };
    }).filter(Boolean);

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
