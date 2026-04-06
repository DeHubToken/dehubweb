/**
 * DHB Buy Bot – Supabase Edge Function
 * ======================================
 * Monitors DHB token buy events on Base mainnet and posts styled
 * buy-alert cards into any community whose ticker_symbol = 'DHB'.
 *
 * Designed to be called on a schedule (e.g. every 60 s via pg_cron or
 * an external cron service hitting the function URL).
 *
 * Env vars required:
 *   SUPABASE_URL              – set automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY – set automatically by Supabase
 *   BASE_RPC_URL              – optional override (default: publicnode)
 *   MIN_BUY_USD               – optional minimum buy in USD to alert (default: 5)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DHB_TOKEN_BASE = '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c';
const BASE_RPC = Deno.env.get('BASE_RPC_URL') || 'https://base-rpc.publicnode.com';
const BOT_WALLET = '0x000000000000000000000000000000000000dead'; // sentinel address for bot messages
const MIN_BUY_USD = parseFloat(Deno.env.get('MIN_BUY_USD') || '50');

// How many blocks to look back on first run (≈5 min at 2 s/block on Base)
const DEFAULT_LOOKBACK_BLOCKS = 150;
// Max blocks per poll to avoid RPC limits
const MAX_BLOCK_RANGE = 300;

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function getBlockNumber(): Promise<bigint> {
  const hex = await rpcCall('eth_blockNumber', []) as string;
  return BigInt(hex);
}

async function getLogs(filter: Record<string, unknown>): Promise<unknown[]> {
  return (await rpcCall('eth_getLogs', [filter])) as unknown[];
}

async function getTransaction(txHash: string): Promise<Record<string, string> | null> {
  return (await rpcCall('eth_getTransactionByHash', [txHash])) as Record<string, string> | null;
}

async function call(to: string, data: string): Promise<string> {
  return (await rpcCall('eth_call', [{ to, data }, 'latest'])) as string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

// ERC-20 balanceOf(address) → 0x70a08231
async function getTokenBalance(token: string, address: string): Promise<bigint> {
  const paddedAddress = address.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = `0x70a08231${paddedAddress}`;
  const result = await call(token, data);
  return BigInt(result);
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

function formatDHB(raw: bigint): number {
  return Number(raw) / 1e18;
}

function formatEth(raw: bigint): number {
  return Number(raw) / 1e18;
}

// ─── DexScreener helpers ──────────────────────────────────────────────────────

interface PairData {
  pairAddress: string;
  priceUsd: number;
  marketCapUsd: number | null;
  pairName: string;
}

async function getDHBPairData(): Promise<PairData | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${DHB_TOKEN_BASE}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data.pairs || []).filter((p: any) => p.chainId === 'base');
    if (pairs.length === 0) return null;

    // Pick highest-liquidity pair
    pairs.sort((a: any, b: any) =>
      parseFloat(b.liquidity?.usd || '0') - parseFloat(a.liquidity?.usd || '0')
    );
    const top = pairs[0];
    return {
      pairAddress: top.pairAddress?.toLowerCase(),
      priceUsd: parseFloat(top.priceUsd || '0'),
      marketCapUsd: top.fdv ? parseFloat(top.fdv) : null,
      pairName: top.baseToken?.symbol || 'DHB',
    };
  } catch {
    return null;
  }
}

// ─── Transfer event decoding ──────────────────────────────────────────────────

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface TransferLog {
  txHash: string;
  blockNumber: bigint;
  from: string;
  to: string;
  amount: bigint;
}

function decodeTransferLog(log: any): TransferLog | null {
  try {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
    const from = `0x${log.topics[1].slice(-40)}`.toLowerCase();
    const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
    const amount = hexToBigInt(log.data);
    return {
      txHash: log.transactionHash,
      blockNumber: hexToBigInt(log.blockNumber),
      from,
      to,
      amount,
    };
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 1. Get DHB pair data (price, market cap, pair address)
    const pair = await getDHBPairData();
    if (!pair) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Could not fetch DHB pair from DexScreener' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[buy-bot] Pair: ${pair.pairAddress}, Price: $${pair.priceUsd}`);

    // 2. Fetch last processed block from state table
    const { data: stateRow } = await supabase
      .from('buy_bot_state')
      .select('last_block_number, last_tx_hashes')
      .eq('id', 'dhb')
      .single();

    const currentBlock = await getBlockNumber();
    const lastBlock = stateRow?.last_block_number
      ? BigInt(stateRow.last_block_number)
      : currentBlock - BigInt(DEFAULT_LOOKBACK_BLOCKS);

    const fromBlock = lastBlock + 1n;
    const toBlock = currentBlock;

    if (fromBlock > toBlock) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No new blocks to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cap range to avoid hitting RPC limits
    const effectiveFrom = toBlock - BigInt(MAX_BLOCK_RANGE) > fromBlock
      ? toBlock - BigInt(MAX_BLOCK_RANGE)
      : fromBlock;

    const processedHashes = new Set<string>(stateRow?.last_tx_hashes || []);

    // 3. Fetch Transfer events for DHB token where from = pair address (= buys)
    const rawLogs = await getLogs({
      address: DHB_TOKEN_BASE,
      topics: [TRANSFER_TOPIC, null, null], // any from/to
      fromBlock: `0x${effectiveFrom.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    });

    console.log(`[buy-bot] Got ${rawLogs.length} Transfer logs`);

    // Filter to only transfers FROM the pair (= buys)
    const buyLogs = (rawLogs as any[])
      .map(decodeTransferLog)
      .filter((l): l is TransferLog =>
        l !== null &&
        l.from === pair.pairAddress &&
        !processedHashes.has(l.txHash)
      );

    console.log(`[buy-bot] Found ${buyLogs.length} buy transfers`);

    if (buyLogs.length === 0) {
      // Update last block even if no buys
      await supabase
        .from('buy_bot_state')
        .upsert({ id: 'dhb', last_block_number: Number(toBlock), updated_at: new Date().toISOString() });

      return new Response(
        JSON.stringify({ ok: true, message: 'No new buys', blocksScanned: Number(toBlock - effectiveFrom) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Find target communities (ticker_symbol = 'DHB')
    const { data: communities } = await supabase
      .from('communities')
      .select('id, name, slug')
      .eq('ticker_symbol', 'DHB');

    if (!communities || communities.length === 0) {
      console.log('[buy-bot] No DHB communities found');
      await supabase
        .from('buy_bot_state')
        .upsert({ id: 'dhb', last_block_number: Number(toBlock), updated_at: new Date().toISOString() });

      return new Response(
        JSON.stringify({ ok: true, message: 'No DHB communities to post to' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch ETH price for USD conversion
    let ethPriceUsd = 3000; // fallback
    try {
      const ethRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      if (ethRes.ok) {
        const ethData = await ethRes.json();
        ethPriceUsd = ethData?.ethereum?.usd ?? 3000;
      }
    } catch { /* use fallback */ }

    // 5. Process each buy
    const newHashes: string[] = [];
    let alertsPosted = 0;

    // Deduplicate by txHash (a single tx may have multiple Transfer events)
    const uniqueBuys = new Map<string, TransferLog>();
    for (const log of buyLogs) {
      if (!uniqueBuys.has(log.txHash)) {
        uniqueBuys.set(log.txHash, log);
      } else {
        // Accumulate DHB amount for same tx
        const existing = uniqueBuys.get(log.txHash)!;
        uniqueBuys.set(log.txHash, { ...existing, amount: existing.amount + log.amount });
      }
    }

    for (const [txHash, log] of uniqueBuys) {
      try {
        const dhbAmount = formatDHB(log.amount);
        const dhbUsdValue = dhbAmount * pair.priceUsd;

        // Skip dust buys below threshold
        if (dhbUsdValue < MIN_BUY_USD) {
          newHashes.push(txHash);
          continue;
        }

        // Get transaction to find ETH sent
        const tx = await getTransaction(txHash);
        const ethSpent = tx?.value ? formatEth(hexToBigInt(tx.value)) : 0;
        const ethUsd = ethSpent * ethPriceUsd;

        // Get buyer's current DHB balance
        let newBalance = 0;
        try {
          const rawBalance = await getTokenBalance(DHB_TOKEN_BASE, log.to);
          newBalance = formatDHB(rawBalance);
        } catch { /* ignore */ }

        // Calculate balance change %
        const prevBalance = Math.max(0, newBalance - dhbAmount);
        const balanceChangePct = prevBalance > 0
          ? ((dhbAmount / prevBalance) * 100)
          : 0;

        // Format market cap
        const marketCapUsd = pair.marketCapUsd;

        // Shorten buyer address
        const shortBuyer = `${log.to.slice(0, 4)}...${log.to.slice(-4)}`;

        // Build the buy alert payload
        const alertPayload = {
          ethSpent,
          ethUsd,
          dhbAmount,
          dhbUsd: dhbUsdValue,
          buyerAddress: log.to,
          shortBuyer,
          txHash,
          newBalance,
          balanceChangePct,
          priceUsd: pair.priceUsd,
          marketCapUsd,
        };

        // Insert into each DHB community
        for (const community of communities) {
          const { error: insertError } = await supabase
            .from('community_chat_messages')
            .insert({
              community_id: community.id,
              wallet_address: BOT_WALLET,
              username: 'buy_bot',
              display_name: '🤖 Buy Bot',
              content: JSON.stringify(alertPayload),
              message_type: 'buy_alert',
              reactions: {},
            });

          if (insertError) {
            console.error(`[buy-bot] Failed to insert alert for community ${community.id}:`, insertError);
          } else {
            alertsPosted++;
          }
        }

        newHashes.push(txHash);
      } catch (err) {
        console.error(`[buy-bot] Error processing tx ${txHash}:`, err);
        newHashes.push(txHash); // still mark as processed to avoid re-processing
      }
    }

    // 6. Update state
    const recentHashes = [...processedHashes, ...newHashes].slice(-200); // keep last 200
    await supabase
      .from('buy_bot_state')
      .upsert({
        id: 'dhb',
        last_block_number: Number(toBlock),
        last_tx_hashes: recentHashes,
        updated_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        ok: true,
        alertsPosted,
        buysDetected: uniqueBuys.size,
        blocksScanned: Number(toBlock - effectiveFrom),
        communities: communities.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[buy-bot] Fatal error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
