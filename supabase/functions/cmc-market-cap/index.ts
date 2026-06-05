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

    const cleanSymbol = symbol.replace(/^\$/, '').toUpperCase();

    // Manual override: $DHB (Dehub) — CMC doesn't list yet, trading paused.
    // Hard-code price/name so the cashtag/search UI surfaces it.
    if (cleanSymbol === 'DHB' || cleanSymbol === 'DEHUB') {
      return new Response(JSON.stringify({
        symbol: 'DHB',
        name: 'Dehub',
        slug: 'dehub',
        cmcRank: null,
        dateAdded: null,
        tags: [],
        maxSupply: null,
        circulatingSupply: null,
        totalSupply: null,
        platform: null,
        price: 0.001,
        marketCap: null,
        fullyDilutedMarketCap: null,
        volume24h: null,
        volumeChange24h: null,
        percentChange1h: null,
        percentChange24h: null,
        percentChange7d: null,
        percentChange30d: null,
        percentChange60d: null,
        percentChange90d: null,
        marketCapDominance: null,
        logo: null,
        description: 'Dehub ($DHB) — price pinned to $0.001 until trading resumes.',
        website: 'https://dehub.net',
        twitter: 'https://twitter.com/dehub_official',
        reddit: null,
        chat: [],
        explorer: [],
        sourceCode: null,
        category: null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch quotes and metadata in parallel
    const [quotesRes, metaRes] = await Promise.all([
      fetch(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(cleanSymbol)}&convert=USD`,
        { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, 'Accept': 'application/json' } }
      ),
      fetch(
        `https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?symbol=${encodeURIComponent(cleanSymbol)}`,
        { headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY, 'Accept': 'application/json' } }
      ).catch(() => null),
    ]);

    const quotesData = await quotesRes.json();

    if (!quotesRes.ok || quotesData.status?.error_code) {
      console.error('CMC API error:', quotesData.status?.error_message);
      return new Response(JSON.stringify({ error: quotesData.status?.error_message || 'CMC API error', marketCap: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = quotesData.data?.[cleanSymbol];
    if (!tokenData) {
      return new Response(JSON.stringify({ marketCap: null, symbol: cleanSymbol }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quote = tokenData.quote?.USD;

    // Parse metadata (v2 returns array per symbol)
    let meta: any = null;
    if (metaRes && metaRes.ok) {
      try {
        const metaJson = await metaRes.json();
        const metaArr = metaJson.data?.[cleanSymbol];
        meta = Array.isArray(metaArr) ? metaArr[0] : metaArr;
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({
      symbol: cleanSymbol,
      name: tokenData.name,
      slug: tokenData.slug || null,
      cmcRank: tokenData.cmc_rank || null,
      dateAdded: tokenData.date_added || null,
      tags: tokenData.tags || [],
      maxSupply: tokenData.max_supply || null,
      circulatingSupply: tokenData.circulating_supply || null,
      totalSupply: tokenData.total_supply || null,
      platform: tokenData.platform ? {
        name: tokenData.platform.name,
        symbol: tokenData.platform.symbol,
        tokenAddress: tokenData.platform.token_address,
      } : null,
      // Quote data
      price: quote?.price || null,
      marketCap: quote?.market_cap || null,
      fullyDilutedMarketCap: quote?.fully_diluted_market_cap || null,
      volume24h: quote?.volume_24h || null,
      volumeChange24h: quote?.volume_change_24h || null,
      percentChange1h: quote?.percent_change_1h || null,
      percentChange24h: quote?.percent_change_24h || null,
      percentChange7d: quote?.percent_change_7d || null,
      percentChange30d: quote?.percent_change_30d || null,
      percentChange60d: quote?.percent_change_60d || null,
      percentChange90d: quote?.percent_change_90d || null,
      marketCapDominance: quote?.market_cap_dominance || null,
      // Metadata (from /info endpoint)
      logo: meta?.logo || null,
      description: meta?.description || null,
      website: meta?.urls?.website?.[0] || null,
      twitter: meta?.urls?.twitter?.[0] || null,
      reddit: meta?.urls?.reddit?.[0] || null,
      chat: meta?.urls?.chat || [],
      explorer: meta?.urls?.explorer || [],
      sourceCode: meta?.urls?.source_code?.[0] || null,
      category: meta?.category || null,
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
