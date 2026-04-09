const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Top traditional assets to show above crypto
const TOP_ASSETS = [
  { symbol: 'GC=F', name: 'Gold', displaySymbol: 'GOLD', icon: '🥇', type: 'commodity' },
  { symbol: 'SI=F', name: 'Silver', displaySymbol: 'SILVER', icon: '🥈', type: 'commodity' },
  { symbol: 'CL=F', name: 'Crude Oil (WTI)', displaySymbol: 'OIL', icon: '🛢️', type: 'commodity' },
  { symbol: 'AAPL', name: 'Apple', displaySymbol: 'AAPL', icon: '🍎', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', displaySymbol: 'MSFT', icon: '💻', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', displaySymbol: 'GOOGL', icon: '🔍', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', displaySymbol: 'AMZN', icon: '📦', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', displaySymbol: 'TSLA', icon: '⚡', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', displaySymbol: 'NVDA', icon: '🎮', type: 'stock' },
  { symbol: 'META', name: 'Meta', displaySymbol: 'META', icon: '👤', type: 'stock' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', displaySymbol: 'BRK.B', icon: '🏛️', type: 'stock' },
  { symbol: 'JPM', name: 'JPMorgan Chase', displaySymbol: 'JPM', icon: '🏦', type: 'stock' },
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
        icon: asset.icon,
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
