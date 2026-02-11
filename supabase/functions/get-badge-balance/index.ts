import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// DHB Token contracts
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_BNB = '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7';

// Staking contract (same on both chains)
const STAKING_CONTRACT = '0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6';

// ERC20 balanceOf selector: 0x70a08231
const BALANCE_OF_SELECTOR = '0x70a08231';

// In-memory cache: address -> { total, timestamp }
const cache = new Map<string, { total: number; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Batch cache for multiple addresses
const batchCache = new Map<string, { results: Record<string, number>; timestamp: number }>();

function encodeBalanceOf(address: string): string {
  const cleaned = address.replace('0x', '').toLowerCase().padStart(64, '0');
  return BALANCE_OF_SELECTOR + cleaned;
}

function hexToNumber(hex: string): number {
  if (!hex || hex === '0x' || hex === '0x0') return 0;
  try {
    // Parse as BigInt then convert to number (DHB has 18 decimals)
    const raw = BigInt(hex);
    // Convert from wei (18 decimals) to human-readable
    return Number(raw) / 1e18;
  } catch {
    return 0;
  }
}

async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const json = await res.json();
  return json.result || '0x0';
}

async function getBalanceForAddress(address: string, alchemyKey: string): Promise<number> {
  // Check cache
  const cached = cache.get(address.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.total;
  }

  const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  const callData = encodeBalanceOf(address);

  // Query all 4 balances in parallel:
  // 1. DHB holdings on Base
  // 2. DHB holdings on BNB
  // 3. Staking balance on Base
  // 4. Staking balance on BNB
  const [baseHoldings, bnbHoldings, baseStaked, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, callData),
    rpcCall(bnbRpc, DHB_BNB, callData),
    rpcCall(baseRpc, STAKING_CONTRACT, callData),
    rpcCall(bnbRpc, STAKING_CONTRACT, callData),
  ]);

  const total =
    hexToNumber(baseHoldings) +
    hexToNumber(bnbHoldings) +
    hexToNumber(baseStaked) +
    hexToNumber(bnbStaked);

  // Cache result
  cache.set(address.toLowerCase(), { total, timestamp: Date.now() });

  return total;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ error: 'ALCHEMY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const address = url.searchParams.get('address');
    const addressesParam = url.searchParams.get('addresses');

    // Batch mode: multiple addresses
    if (addressesParam) {
      const addresses = addressesParam.split(',').map(a => a.trim()).filter(Boolean).slice(0, 50);
      
      if (addresses.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No valid addresses provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create batch cache key
      const batchKey = addresses.map(a => a.toLowerCase()).sort().join(',');
      const batchCached = batchCache.get(batchKey);
      if (batchCached && Date.now() - batchCached.timestamp < CACHE_TTL_MS) {
        return new Response(
          JSON.stringify({ results: batchCached.results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
        );
      }

      const results: Record<string, number> = {};
      // Process in batches of 10 to avoid overwhelming RPC
      for (let i = 0; i < addresses.length; i += 10) {
        const batch = addresses.slice(i, i + 10);
        const balances = await Promise.all(
          batch.map(addr => getBalanceForAddress(addr, alchemyKey))
        );
        batch.forEach((addr, idx) => {
          results[addr.toLowerCase()] = balances[idx];
        });
      }

      batchCache.set(batchKey, { results, timestamp: Date.now() });

      return new Response(
        JSON.stringify({ results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
      );
    }

    // Single address mode
    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Missing address parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const total = await getBalanceForAddress(address, alchemyKey);

    return new Response(
      JSON.stringify({ address: address.toLowerCase(), badgeBalance: total }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (error) {
    console.error('[get-badge-balance] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
