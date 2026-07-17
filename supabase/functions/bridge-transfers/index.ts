/**
 * Bridge Transfers Edge Function
 * ==============================
 * Uses Alchemy's alchemy_getAssetTransfers API to fetch all ERC-20 DHB
 * Transfer events TO the bridge relay address on both Base and BNB Chain.
 * All historical transfers are marked as Complete.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BRIDGE_ADDRESS = '0x11D79aE9a0F8a8f9Fcf5BE71e403ed203EC2394d';
const ALCHEMY_KEY = Deno.env.get('ALCHEMY_API_KEY') || '';

const CHAINS = [
  {
    chainId: 8453,
    name: 'Base',
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    dhbToken: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
    explorer: 'https://basescan.org',
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrl: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    dhbToken: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
    explorer: 'https://bscscan.com',
  },
];

interface TransferRecord {
  txHash: string;
  from: string;
  amount: string;
  chain: string;
  chainId: number;
  explorerUrl: string;
  blockNumber: number;
  timestamp: number;
  status: string;
}

/** Fetch block timestamp via eth_getBlockByNumber (no tx details). */
async function getBlockTimestamp(rpcUrl: string, blockNumHex: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getBlockByNumber',
        params: [blockNumHex, false],
      }),
    });
    const json = await res.json();
    if (json.result?.timestamp) {
      return parseInt(json.result.timestamp, 16);
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchTransfersForChain(chain: typeof CHAINS[0]): Promise<TransferRecord[]> {
  try {
    const allTransfers: TransferRecord[] = [];
    let pageKey: string | undefined;

    do {
      const params: any = {
        fromBlock: '0x0',
        toBlock: 'latest',
        toAddress: BRIDGE_ADDRESS,
        contractAddresses: [chain.dhbToken],
        category: ['erc20'],
        withMetadata: true,
        order: 'desc',
        maxCount: '0x3e8',
      };
      if (pageKey) params.pageKey = pageKey;

      const res = await fetch(chain.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [params],
        }),
      });
      const json = await res.json();

      if (json.error) {
        console.error(`[bridge-transfers] Alchemy error on ${chain.name}:`, json.error);
        break;
      }

      const result = json.result;
      if (!result?.transfers?.length) break;

      // Collect block numbers that lack metadata timestamps
      const needTimestamp: Map<string, string> = new Map(); // blockHex -> blockHex
      for (const tx of result.transfers) {
        if (!tx.metadata?.blockTimestamp) {
          needTimestamp.set(tx.blockNum, tx.blockNum);
        }
      }

      // Batch-fetch missing block timestamps (max 10 concurrent)
      const blockTimestamps: Record<string, number> = {};
      const blockHexes = [...needTimestamp.keys()];
      for (let i = 0; i < blockHexes.length; i += 10) {
        const batch = blockHexes.slice(i, i + 10);
        const results = await Promise.all(
          batch.map(hex => getBlockTimestamp(chain.rpcUrl, hex))
        );
        batch.forEach((hex, idx) => {
          if (results[idx] != null) blockTimestamps[hex] = results[idx]!;
        });
      }

      for (const tx of result.transfers) {
        const rawValue = tx.value ?? 0;
        const amount = rawValue < 1
          ? rawValue.toFixed(4)
          : Math.floor(rawValue).toLocaleString('en-US');

        const blockNum = parseInt(tx.blockNum, 16);

        // Prefer metadata timestamp, then fetched block timestamp, then fallback
        let timestamp: number;
        if (tx.metadata?.blockTimestamp) {
          timestamp = Math.floor(new Date(tx.metadata.blockTimestamp).getTime() / 1000);
        } else if (blockTimestamps[tx.blockNum]) {
          timestamp = blockTimestamps[tx.blockNum];
        } else {
          timestamp = Math.floor(Date.now() / 1000);
        }

        allTransfers.push({
          txHash: tx.hash,
          from: tx.from.toLowerCase(),
          amount,
          chain: chain.name,
          chainId: chain.chainId,
          explorerUrl: `${chain.explorer}/tx/${tx.hash}`,
          blockNumber: blockNum,
          timestamp,
          status: 'Complete',
        });
      }

      pageKey = result.pageKey;
    } while (pageKey);

    return allTransfers;
  } catch (err) {
    console.error(`[bridge-transfers] Error fetching ${chain.name}:`, err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const [baseTransfers, bnbTransfers] = await Promise.all(
      CHAINS.map(fetchTransfersForChain)
    );

    const all = [...baseTransfers, ...bnbTransfers]
      .sort((a, b) => b.timestamp - a.timestamp);

    return new Response(JSON.stringify({ transfers: all }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[bridge-transfers] Error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch bridge transfers' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
