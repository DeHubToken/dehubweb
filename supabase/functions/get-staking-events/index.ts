/**
 * Get Staking Events
 * ==================
 * Fetches recent Stake/Unstake transactions using block explorer APIs (BSCScan/BaseScan).
 * More reliable than eth_getLogs for historical events across large block ranges.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
};

const BNB_STAKING_CONTRACT = '0x26d2cd7763106fdce443fadd36163e2ad33a76e6';
const BASE_STAKING_ADDRESS = '0x7b10dd033Ac41B8AF85eE1701e344B86e446250B';
const BNB_DHB_TOKEN = '0x680d3113caf77b61b510f332d5ef4cf5b41a761d';
const BASE_DHB_TOKEN = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';

interface TransferEvent {
  wallet: string;
  amount: string;
  txHash: string;
  timestamp: number;
  chain: 'BNB' | 'Base';
  type: 'stake' | 'unstake';
}

function formatAmount(rawValue: string, decimals = 18): string {
  const raw = BigInt(rawValue);
  const whole = raw / BigInt(10 ** decimals);
  const frac = raw % BigInt(10 ** decimals);
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fracStr}`;
}

/**
 * Fetch token transfer events using block explorer API (etherscan-compatible)
 */
async function fetchFromExplorer(
  apiUrl: string,
  tokenAddress: string,
  stakingAddress: string,
  chain: 'BNB' | 'Base',
  type: 'stake' | 'unstake',
  limit: number,
): Promise<TransferEvent[]> {
  // For unstakes: transfers FROM staking address (staking sends tokens to user)
  // For stakes: transfers TO staking address (user sends tokens to staking)
  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    contractaddress: tokenAddress,
    address: stakingAddress,
    page: '1',
    offset: String(limit),
    sort: 'desc',
  });

  const url = `${apiUrl}?${params}`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    const data = await res.json();
    
    if (data.status !== '1' || !Array.isArray(data.result)) {
      console.warn(`[get-staking-events] Explorer API returned:`, data.message || data.status);
      return [];
    }

    return data.result
      .filter((tx: any) => {
        if (type === 'unstake') {
          // Unstake = transfer FROM staking address to user
          return tx.from.toLowerCase() === stakingAddress.toLowerCase();
        } else {
          // Stake = transfer TO staking address from user
          return tx.to.toLowerCase() === stakingAddress.toLowerCase();
        }
      })
      .map((tx: any) => ({
        wallet: type === 'unstake' ? tx.to : tx.from,
        amount: formatAmount(tx.value, parseInt(tx.tokenDecimal || '18')),
        txHash: tx.hash,
        timestamp: parseInt(tx.timeStamp),
        chain,
        type,
      }));
  } catch (err) {
    console.error(`[get-staking-events] Explorer fetch failed for ${chain}:`, (err as Error).message);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type || 'unstake';
    const limit = Math.min(body.limit || 50, 100);

    // Use free BSCScan/BaseScan APIs (no key needed for basic queries)
    const [bnbEvents, baseEvents] = await Promise.all([
      fetchFromExplorer(
        'https://api.bscscan.com/api',
        BNB_DHB_TOKEN,
        BNB_STAKING_CONTRACT,
        'BNB',
        type,
        limit,
      ),
      fetchFromExplorer(
        'https://api.basescan.org/api',
        BASE_DHB_TOKEN,
        BASE_STAKING_ADDRESS,
        'Base',
        type,
        limit,
      ),
    ]);

    // Merge and sort by timestamp (newest first)
    const allEvents = [...bnbEvents, ...baseEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return new Response(
      JSON.stringify({ events: allEvents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[get-staking-events] Error:', err);
    return new Response(
      JSON.stringify({ events: [], error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
