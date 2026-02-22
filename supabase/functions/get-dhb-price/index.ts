import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Token contract addresses per chain for DexScreener lookups.
 * DexScreener uses chain slugs: "base", "bsc", "ethereum".
 */
const TOKEN_ADDRESSES: { chain: string; address: string; symbol: string }[] = [
  // DHB on Base
  { chain: 'base', address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', symbol: 'DHB' },
  // DHB on BNB
  { chain: 'bsc', address: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7', symbol: 'DHB' },
  // USDT on Base
  { chain: 'base', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT' },
  // USDT on BNB
  { chain: 'bsc', address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' },
  // USDT on Ethereum
  { chain: 'ethereum', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
];

/**
 * Fetch price from DexScreener for a token address.
 * Returns USD price or null if not found.
 */
async function getDexScreenerPrice(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // DexScreener returns pairs sorted by liquidity; take the first pair's priceUsd
    const pairs = data.pairs;
    if (!pairs || pairs.length === 0) return null;
    const price = parseFloat(pairs[0].priceUsd);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

/**
 * Fetch native token prices (ETH, BNB) from CoinGecko as a lightweight fallback
 * since native tokens don't have contract-based DEX pairs.
 */
async function getNativePrices(): Promise<{ ETH: number; BNB: number }> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd',
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) throw new Error('CoinGecko error');
    const data = await res.json();
    return {
      ETH: data.ethereum?.usd ?? 0,
      BNB: data.binancecoin?.usd ?? 0,
    };
  } catch {
    return { ETH: 0, BNB: 0 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Deduplicate addresses for DexScreener batch lookup
    const uniqueAddresses = [...new Set(TOKEN_ADDRESSES.map(t => t.address.toLowerCase()))];

    // Fetch DexScreener prices + native prices in parallel
    const [dexPricesMap, nativePrices] = await Promise.all([
      (async () => {
        const results = await Promise.all(uniqueAddresses.map(addr => getDexScreenerPrice(addr)));
        const map: Record<string, number> = {};
        uniqueAddresses.forEach((addr, i) => {
          if (results[i] !== null) map[addr] = results[i]!;
        });
        return map;
      })(),
      getNativePrices(),
    ]);

    // Build symbol -> price map (take first match per symbol)
    const prices: Record<string, number> = {
      ETH: nativePrices.ETH,
      WETH: nativePrices.ETH,
      BNB: nativePrices.BNB,
      WBNB: nativePrices.BNB,
    };

    for (const token of TOKEN_ADDRESSES) {
      const addr = token.address.toLowerCase();
      if (dexPricesMap[addr] !== undefined && prices[token.symbol] === undefined) {
        prices[token.symbol] = dexPricesMap[addr];
      }
    }

    // Ensure USDT has a sane fallback
    if (!prices.USDT || prices.USDT === 0) prices.USDT = 1;

    console.log('Token prices fetched (DexScreener + CoinGecko native):', prices);

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
