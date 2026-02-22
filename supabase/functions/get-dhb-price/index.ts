import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Tokens to look up on DexScreener by contract address */
const TOKEN_ADDRESSES: { chain: string; address: string; symbol: string }[] = [
  { chain: 'base', address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', symbol: 'DHB' },
  { chain: 'bsc', address: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7', symbol: 'DHB' },
  { chain: 'base', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT' },
  { chain: 'bsc', address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' },
  { chain: 'ethereum', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
];

/** CoinGecko ID mapping for fallback */
const COINGECKO_IDS: Record<string, string> = {
  DHB: 'dehub',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  USDT: 'tether',
};

async function getDexScreenerPrice(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = data.pairs;
    if (!pairs || pairs.length === 0) return null;
    const price = parseFloat(pairs[0].priceUsd);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function getCoinGeckoPrices(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, number> = {};
    for (const [id, val] of Object.entries(data)) {
      map[id] = (val as any)?.usd ?? 0;
    }
    return map;
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1) Try DexScreener for all token addresses
    const uniqueAddresses = [...new Set(TOKEN_ADDRESSES.map(t => t.address.toLowerCase()))];
    const dexResults = await Promise.all(uniqueAddresses.map(addr => getDexScreenerPrice(addr)));
    const dexMap: Record<string, number> = {};
    uniqueAddresses.forEach((addr, i) => {
      if (dexResults[i] !== null) dexMap[addr] = dexResults[i]!;
    });

    // Build prices from DexScreener (first match per symbol wins)
    const prices: Record<string, number> = {};
    for (const token of TOKEN_ADDRESSES) {
      const addr = token.address.toLowerCase();
      if (prices[token.symbol] === undefined && dexMap[addr] !== undefined) {
        prices[token.symbol] = dexMap[addr];
      }
    }

    // 2) Determine which symbols still need a price, fall back to CoinGecko
    const allSymbols = ['DHB', 'ETH', 'BNB', 'USDT'];
    const missingSymbols = allSymbols.filter(s => prices[s] === undefined || prices[s] === 0);
    if (missingSymbols.length > 0) {
      const geckoIds = missingSymbols.map(s => COINGECKO_IDS[s]).filter(Boolean);
      const geckoMap = await getCoinGeckoPrices(geckoIds);

      for (const symbol of missingSymbols) {
        const geckoId = COINGECKO_IDS[symbol];
        if (geckoId && geckoMap[geckoId]) {
          prices[symbol] = geckoMap[geckoId];
        }
      }
    }

    // Aliases
    prices.WETH = prices.ETH ?? 0;
    prices.WBNB = prices.BNB ?? 0;

    // Native tokens — if still missing, fetch from CoinGecko
    if (!prices.ETH || prices.ETH === 0 || !prices.BNB || prices.BNB === 0) {
      const nativeIds: string[] = [];
      if (!prices.ETH || prices.ETH === 0) nativeIds.push('ethereum');
      if (!prices.BNB || prices.BNB === 0) nativeIds.push('binancecoin');
      const nativeMap = await getCoinGeckoPrices(nativeIds);
      if (nativeMap.ethereum) { prices.ETH = nativeMap.ethereum; prices.WETH = nativeMap.ethereum; }
      if (nativeMap.binancecoin) { prices.BNB = nativeMap.binancecoin; prices.WBNB = nativeMap.binancecoin; }
    }

    // USDT sane fallback
    if (!prices.USDT || prices.USDT === 0) prices.USDT = 1;

    console.log('Token prices (DexScreener → CoinGecko fallback):', prices);

    return new Response(
      JSON.stringify({ prices, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching token prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
