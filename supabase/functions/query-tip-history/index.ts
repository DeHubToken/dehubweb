import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DHB token contracts
const DHB_CONTRACTS: Record<number, string> = {
  8453: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', // Base
  56: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7',    // BNB
};

// Transfer(address,address,uint256) topic
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Approximate block times (seconds per block)
const BLOCK_TIMES: Record<number, number> = {
  8453: 2,   // Base ~2s
  56: 3,     // BNB ~3s
};

// Period durations in seconds
const PERIOD_SECONDS: Record<string, number> = {
  day: 86400,
  week: 604800,
  month: 2592000,   // 30 days
  year: 31536000,   // 365 days
};

interface TransferLog {
  topics: string[];
  data: string;
}

function decodeAddress(topic: string): string {
  return '0x' + topic.slice(26).toLowerCase();
}

function decodeAmount(data: string): number {
  // DHB has 18 decimals
  const raw = BigInt(data);
  // Convert to number with 18 decimal precision (divide by 1e18)
  return Number(raw / BigInt(1e14)) / 10000;
}

async function getBlockNumber(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

async function getLogs(rpcUrl: string, contractAddress: string, fromBlock: number, toBlock: number): Promise<TransferLog[]> {
  const allLogs: TransferLog[] = [];
  const MAX_RANGE = 100000; // Alchemy supports up to ~2000 blocks for some chains, but Base allows larger ranges
  
  let current = fromBlock;
  while (current <= toBlock) {
    const end = Math.min(current + MAX_RANGE - 1, toBlock);
    console.log(`[TipHistory] Fetching logs ${current} -> ${end} (${end - current + 1} blocks)`);
    
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{
          address: contractAddress,
          topics: [TRANSFER_TOPIC],
          fromBlock: '0x' + current.toString(16),
          toBlock: '0x' + end.toString(16),
        }],
      }),
    });
    
    const json = await res.json();
    if (json.error) {
      console.error(`[TipHistory] RPC error:`, json.error);
      // If range too large, halve it
      if (json.error.message?.includes('range') || json.error.code === -32005) {
        const mid = Math.floor((current + end) / 2);
        if (mid === current) break; // Can't split further
        // Retry with smaller range by reducing MAX_RANGE logic
        const half1 = await getLogs(rpcUrl, contractAddress, current, mid);
        const half2 = await getLogs(rpcUrl, contractAddress, mid + 1, end);
        allLogs.push(...half1, ...half2);
        current = end + 1;
        continue;
      }
      break;
    }
    
    if (json.result) {
      allLogs.push(...json.result);
    }
    current = end + 1;
  }
  
  return allLogs;
}

function aggregateTransfers(logs: TransferLog[]): { sent: Record<string, number>; received: Record<string, number> } {
  const sent: Record<string, number> = {};
  const received: Record<string, number> = {};
  
  for (const log of logs) {
    if (log.topics.length < 3) continue;
    const from = decodeAddress(log.topics[1]);
    const to = decodeAddress(log.topics[2]);
    const amount = decodeAmount(log.data);
    
    // Skip zero amounts and mint/burn addresses
    if (amount <= 0) continue;
    if (from === '0x0000000000000000000000000000000000000000') continue;
    if (to === '0x0000000000000000000000000000000000000000') continue;
    
    sent[from] = (sent[from] || 0) + amount;
    received[to] = (received[to] || 0) + amount;
  }
  
  return { sent, received };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ error: 'ALCHEMY_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request params
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || 'all';
    const chainParam = url.searchParams.get('chain'); // optional: '8453' or '56'
    
    const chainIds = chainParam ? [parseInt(chainParam)] : [8453, 56];
    const periods = period === 'all_periods' ? ['day', 'week', 'month', 'year', 'all'] : [period];
    
    console.log(`[TipHistory] Starting scan for periods=${periods.join(',')} chains=${chainIds.join(',')}`);
    
    const rpcUrls: Record<number, string> = {
      8453: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      56: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    };

    const results: { period: string; chain: number; wallets: number }[] = [];

    for (const chainId of chainIds) {
      const rpcUrl = rpcUrls[chainId];
      const contract = DHB_CONTRACTS[chainId];
      if (!rpcUrl || !contract) continue;

      let latestBlock: number;
      try {
        latestBlock = await getBlockNumber(rpcUrl);
        console.log(`[TipHistory] Chain ${chainId} latest block: ${latestBlock}`);
      } catch (e) {
        console.error(`[TipHistory] Failed to get block number for chain ${chainId}:`, e);
        continue;
      }

      for (const p of periods) {
        let fromBlock: number;
        if (p === 'all') {
          // Go back ~2 years or use genesis
          fromBlock = Math.max(1, latestBlock - Math.floor(63072000 / BLOCK_TIMES[chainId]));
        } else {
          const seconds = PERIOD_SECONDS[p];
          const blockRange = Math.floor(seconds / BLOCK_TIMES[chainId]);
          fromBlock = Math.max(1, latestBlock - blockRange);
        }

        console.log(`[TipHistory] Chain ${chainId} period=${p} scanning blocks ${fromBlock} -> ${latestBlock}`);
        
        const logs = await getLogs(rpcUrl, contract, fromBlock, latestBlock);
        console.log(`[TipHistory] Chain ${chainId} period=${p}: ${logs.length} transfer events`);
        
        const { sent, received } = aggregateTransfers(logs);
        
        // Collect all unique wallets
        const allWallets = new Set([...Object.keys(sent), ...Object.keys(received)]);
        
        if (allWallets.size === 0) {
          console.log(`[TipHistory] No transfers found for chain ${chainId} period=${p}`);
          continue;
        }
        
        // Upsert into tip_leaderboard_cache
        const rows = Array.from(allWallets).map(wallet => ({
          wallet_address: wallet,
          chain_id: chainId,
          sent_total: sent[wallet] || 0,
          received_total: received[wallet] || 0,
          period: p,
          updated_at: new Date().toISOString(),
        }));
        
        // Batch upsert in chunks of 500
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error: upsertError } = await supabase
            .from('tip_leaderboard_cache')
            .upsert(chunk, { onConflict: 'wallet_address,chain_id,period' });
          
          if (upsertError) {
            console.error(`[TipHistory] Upsert error:`, upsertError);
          }
        }
        
        results.push({ period: p, chain: chainId, wallets: allWallets.size });
        console.log(`[TipHistory] Chain ${chainId} period=${p}: cached ${allWallets.size} wallets`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[TipHistory] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
