import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Ticker search ───────────────────────────────────────────────────────────

interface CmcMapEntry {
  id: number;
  name: string;
  symbol: string;
  rank: number | null;
  platform: { token_address?: string } | null;
}

/**
 * The listed universe, by rank, held for an hour.
 *
 * Lives in module scope so it survives across requests on a warm instance. An
 * hour is safe: a new listing appearing in the picker an hour late is invisible,
 * whereas re-fetching 5,000 rows per keystroke is not.
 */
let mapCache: { at: number; entries: CmcMapEntry[] } | null = null;
const MAP_TTL_MS = 60 * 60 * 1000;
const MAP_LIMIT = 5000;

async function loadCmcMap(apiKey: string): Promise<CmcMapEntry[]> {
  if (mapCache && Date.now() - mapCache.at < MAP_TTL_MS) return mapCache.entries;
  const res = await fetch(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=${MAP_LIMIT}&sort=cmc_rank&listing_status=active`,
    { headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' } },
  );
  if (!res.ok) return mapCache?.entries ?? [];
  const data = await res.json();
  const entries: CmcMapEntry[] = Array.isArray(data?.data)
    ? data.data.map((d: Record<string, unknown>) => ({
        id: d.id as number,
        name: (d.name as string) ?? '',
        symbol: (d.symbol as string) ?? '',
        rank: (d.rank as number) ?? null,
        platform: (d.platform as { token_address?: string } | null) ?? null,
      }))
    : [];
  if (entries.length) mapCache = { at: Date.now(), entries };
  return entries;
}

async function searchCmcMap(rawQuery: string, apiKey: string) {
  const q = rawQuery.replace(/^\$/, '').trim().toUpperCase();
  if (!q) return [];

  const entries = await loadCmcMap(apiKey);
  const scored = entries
    .filter((e) => e.symbol.toUpperCase().startsWith(q) || e.name.toUpperCase().startsWith(q))
    .sort((a, b) => {
      // An exact ticker beats a prefix, then rank decides. Without the exact-match
      // rule "BTC" lands under whichever BTC-prefixed coin happens to rank higher.
      const aExact = a.symbol.toUpperCase() === q ? 1 : 0;
      const bExact = b.symbol.toUpperCase() === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (a.rank ?? 99_999) - (b.rank ?? 99_999);
    })
    .slice(0, 6);

  if (scored.length === 0) return [];

  // One quotes call for the whole shortlist, so the picker can show prices.
  const ids = scored.map((e) => e.id).join(',');
  const [quotesRes, infoRes] = await Promise.all([
    fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${ids}&convert=USD`,
      { headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' } },
    ).catch(() => null),
    fetch(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=${ids}`, {
      headers: { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' },
    }).catch(() => null),
  ]);

  const quotes = quotesRes?.ok ? (await quotesRes.json())?.data ?? {} : {};
  const info = infoRes?.ok ? (await infoRes.json())?.data ?? {} : {};

  return scored.map((e) => {
    const quote = quotes?.[String(e.id)];
    const usd = quote?.quote?.USD;
    return {
      symbol: e.symbol.toUpperCase(),
      name: e.name,
      cmcRank: e.rank,
      logo: info?.[String(e.id)]?.logo ?? null,
      price: usd?.price ?? null,
      percentChange24h: usd?.percent_change_24h ?? null,
      address: e.platform?.token_address ?? null,
    };
  });
}

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

    const body = await req.json();
    const { symbol, query } = body ?? {};

    // Ticker search for the composer's asset picker.
    //
    // `?symbol=` on the quotes endpoint is exact-match only, which is no use to
    // somebody who has typed two letters. The map endpoint is the whole listed
    // universe and is cached in module scope, so prefix search costs one CMC
    // call per cold instance rather than one per keystroke.
    if (typeof query === 'string' && query.trim()) {
      const results = await searchCmcMap(query, CMC_API_KEY);
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        maxSupply: 1_000_000_000,
        circulatingSupply: 1_000_000_000,
        totalSupply: 1_000_000_000,
        platform: { name: 'Base', symbol: 'ETH', tokenAddress: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c' },
        price: 0.001,
        marketCap: 1_000_000,
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
