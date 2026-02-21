import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// DHB Token contracts
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const DHB_BNB = '0x680d3113caf77b61b510f332d5ef4cf5b41a761d';

// Staking contract (BNB only — does not exist on Base)
const STAKING_CONTRACT = '0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6';

// Function selectors
const BALANCE_OF_SELECTOR = '0x70a08231'; // balanceOf(address)
const USER_INFOS_SELECTOR = '0x43b0215f'; // userInfos(address) → first slot = totalAmount

// Public BNB RPCs as fallback (Alchemy BNB can return empty results)
const BNB_PUBLIC_RPCS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
];

// In-memory cache
const cache = new Map<string, { total: number; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const batchCache = new Map<string, { results: Record<string, number>; timestamp: number }>();
let dehubLeaderboardCache: { entries: any[]; timestamp: number } | null = null;

function encodeCall(selector: string, address: string): string {
  const cleaned = address.replace('0x', '').toLowerCase().padStart(64, '0');
  return selector + cleaned;
}

/** Parse first 32-byte slot from hex return data */
function hexFirstSlotToNumber(hex: string): number {
  if (!hex || hex === '0x' || hex === '0x0') return 0;
  try {
    // Take first 32 bytes (64 hex chars) after 0x prefix
    const firstSlot = hex.length >= 66 ? '0x' + hex.slice(2, 66) : hex;
    const raw = BigInt(firstSlot);
    return Number(raw) / 1e18;
  } catch {
    return 0;
  }
}

function hexToNumber(hex: string): number {
  if (!hex || hex === '0x' || hex === '0x0') return 0;
  try {
    return Number(BigInt(hex)) / 1e18;
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
  if (json.error) {
    console.error(`[rpc-error] to=${to} data=${data.slice(0, 10)} error=`, json.error);
  }
  return json.result || '0x0';
}

/** Call BNB with fallback to public RPCs if Alchemy returns empty */
async function bnbRpcCall(alchemyBnbRpc: string, to: string, data: string): Promise<string> {
  // Try Alchemy first
  const result = await rpcCall(alchemyBnbRpc, to, data);
  if (result && result !== '0x0' && result !== '0x') {
    return result;
  }
  
  // Fallback to public RPCs
  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallbackResult = await rpcCall(rpc, to, data);
      if (fallbackResult && fallbackResult !== '0x0' && fallbackResult !== '0x') {
        return fallbackResult;
      }
    } catch {
      continue;
    }
  }
  
  return result; // Return whatever Alchemy gave us
}

/** Fallback: look up address total from the live DeHub leaderboard API (cached in-memory) */
async function getLeaderboardApiFallback(address: string): Promise<number> {
  try {
    // Use cached leaderboard data if fresh
    if (dehubLeaderboardCache && Date.now() - dehubLeaderboardCache.timestamp < CACHE_TTL_MS) {
      const match = dehubLeaderboardCache.entries.find((e: any) => e.account?.toLowerCase() === address.toLowerCase());
      return match?.total || 0;
    }

    const res = await fetch('https://api.dehub.io/api/leaderboard?sort=holdings', {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.log('[api-fallback] HTTP error:', res.status);
      return 0;
    }
    const json = await res.json();
    const entries = json?.result?.byWalletBalance || json?.result || [];
    if (!Array.isArray(entries)) return 0;

    // Cache the leaderboard data
    dehubLeaderboardCache = { entries, timestamp: Date.now() };

    const match = entries.find((e: any) => e.account?.toLowerCase() === address.toLowerCase());
    if (match?.total) {
      console.log(`[api-fallback] Found ${address}: total=${match.total}`);
      return match.total;
    }
    return 0;
  } catch (err) {
    console.error('[api-fallback] Error:', err);
    return 0;
  }
}

async function getBalanceForAddress(address: string, alchemyKey: string): Promise<number> {
  const cached = cache.get(address.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.total;
  }

  const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);

  // Query: Base holdings, BNB holdings (with fallback), BNB staking (staking only on BNB)
  const [baseHoldingsHex, bnbHoldingsHex, bnbStakedHex] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData),
  ]);

  const baseHoldings = hexToNumber(baseHoldingsHex);
  const bnbHoldings = hexToNumber(bnbHoldingsHex);
  const bnbStaked = hexFirstSlotToNumber(bnbStakedHex); // userInfos returns tuple, first slot = totalAmount
  let total = baseHoldings + bnbHoldings + bnbStaked;

  // If on-chain balance is 0, fall back to DeHub API (covers tokens on other chains/contracts)
  if (total === 0) {
    const fallback = await getLeaderboardApiFallback(address);
    if (fallback > 0) {
      console.log(`[balance] ${address}: on-chain=0, api-fallback=${fallback}`);
      total = fallback;
    }
  }

  console.log(`[balance] ${address}: base=${baseHoldings}, bnb=${bnbHoldings}, staked=${bnbStaked}, total=${total}`);

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

    // Batch mode
    if (addressesParam) {
      const addresses = addressesParam.split(',').map(a => a.trim()).filter(Boolean).slice(0, 50);
      
      if (addresses.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No valid addresses provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const batchKey = addresses.map(a => a.toLowerCase()).sort().join(',');
      const batchCached = batchCache.get(batchKey);
      if (batchCached && Date.now() - batchCached.timestamp < CACHE_TTL_MS) {
        return new Response(
          JSON.stringify({ results: batchCached.results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
        );
      }

      const results: Record<string, number> = {};
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
