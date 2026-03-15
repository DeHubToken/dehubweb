/**
 * Bridge Transfers Edge Function
 * ==============================
 * Fetches all ERC-20 DHB Transfer events TO the bridge relay address
 * on both Base and BNB Chain. Returns a unified sorted list.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BRIDGE_ADDRESS = '0x11D79aE9a0F8a8f9Fcf5BE71e403ed203EC2394d'.toLowerCase();

const ALCHEMY_KEY = Deno.env.get('ALCHEMY_API_KEY') || '';

const CHAINS = [
  {
    chainId: 8453,
    name: 'Base',
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    dhbToken: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
    explorer: 'https://basescan.org',
    decimals: 18,
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrl: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    dhbToken: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D',
    explorer: 'https://bscscan.com',
    decimals: 18,
  },
];

// ERC-20 Transfer(address,address,uint256) topic
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface TransferRecord {
  txHash: string;
  from: string;
  amount: string;
  chain: string;
  chainId: number;
  explorerUrl: string;
  blockNumber: number;
  timestamp: number;
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function fetchTransfersForChain(chain: typeof CHAINS[0]): Promise<TransferRecord[]> {
  try {
    // Get current block
    const currentBlockHex = await rpcCall(chain.rpcUrl, 'eth_blockNumber', []);
    const currentBlock = parseInt(currentBlockHex, 16);
    
    // Go back ~7 days: Base ~2s blocks = 302400, BNB ~3s blocks = 201600
    const blocksBack = chain.chainId === 8453 ? 302400 : 201600;
    const fromBlock = Math.max(0, currentBlock - blocksBack);

    // Query Transfer events TO the bridge address
    const bridgePadded = '0x' + BRIDGE_ADDRESS.slice(2).padStart(64, '0');
    
    const logs = await rpcCall(chain.rpcUrl, 'eth_getLogs', [{
      address: chain.dhbToken,
      topics: [TRANSFER_TOPIC, null, bridgePadded],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) return [];

    // Get block timestamps for unique blocks
    const blockNumbers = [...new Set(logs.map((l: any) => l.blockNumber))];
    const timestamps: Record<string, number> = {};

    // Batch fetch timestamps (10 at a time)
    for (let i = 0; i < blockNumbers.length; i += 10) {
      const batch = blockNumbers.slice(i, i + 10);
      const blocks = await Promise.all(
        batch.map((bn: string) => rpcCall(chain.rpcUrl, 'eth_getBlockByNumber', [bn, false]))
      );
      blocks.forEach((block: any, idx: number) => {
        if (block) timestamps[batch[idx]] = parseInt(block.timestamp, 16);
      });
    }

    return logs.map((log: any) => {
      const from = '0x' + log.topics[1].slice(26).toLowerCase();
      const value = BigInt(log.data);
      const amount = Number(value) / Math.pow(10, chain.decimals);
      const blockNum = parseInt(log.blockNumber, 16);

      return {
        txHash: log.transactionHash,
        from,
        amount: amount < 1 ? amount.toFixed(4) : Math.floor(amount).toLocaleString('en-US'),
        chain: chain.name,
        chainId: chain.chainId,
        explorerUrl: `${chain.explorer}/tx/${log.transactionHash}`,
        blockNumber: blockNum,
        timestamp: timestamps[log.blockNumber] || Math.floor(Date.now() / 1000),
      };
    });
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
