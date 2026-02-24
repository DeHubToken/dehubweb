import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// DHB Token addresses (we query Transfer events on these)
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7";

// Contracts that receive/send DHB for tips and bounties
// On Base, tip + bounty share the same address
const BASE_TIP_CONTRACT = "0x4fa30dAef50c6dc8593470750F3c721CA3275581";
// On BNB, tip and bounty (StreamController) are separate
const BNB_TIP_CONTRACT = "0x6E19ba22da239C46941582530c0Ef61400B0e3e6";
const BNB_BOUNTY_CONTRACT = "0x9f8012074d27F8596C0E5038477ACB52057BC934";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const BNB_PUBLIC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

const BASE_BLOCKS_PER_DAY = 43200;
const BNB_BLOCKS_PER_DAY = 28800;

// Chunk sizes for eth_getLogs to stay within RPC limits
const BNB_CHUNK_SIZE = 5_000;
const BASE_CHUNK_SIZE = 50_000;

const PERIODS = [
  { name: "day", daysAgo: 1 },
  { name: "week", daysAgo: 7 },
  { name: "month", daysAgo: 30 },
  { name: "year", daysAgo: 365 },
];

function padAddress(address: string): string {
  return "0x" + address.replace("0x", "").toLowerCase().padStart(64, "0");
}

function hexToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    return Number(BigInt(hex)) / 1e18;
  } catch {
    return 0;
  }
}

async function getCurrentBlockNumber(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const json = await res.json();
  return Number(BigInt(json.result));
}

// Get Transfer logs from a token contract filtered by a specific topic position
async function getLogs(
  rpcUrl: string,
  tokenAddress: string,
  fromBlock: string,
  toBlock: string,
  topics: (string | null)[]
): Promise<Array<{ topics: string[]; data: string }>> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{ address: tokenAddress, fromBlock, toBlock, topics }],
    }),
  });
  const json = await res.json();
  if (json.error) {
    console.error(`[getLogs-error] token=${tokenAddress} from=${fromBlock} to=${toBlock}`, json.error);
    return [];
  }
  return json.result || [];
}

// Chunked getLogs: splits large block ranges into smaller chunks to avoid RPC limits
async function getLogsChunked(
  rpcUrl: string,
  tokenAddress: string,
  fromBlock: number,
  toBlock: number,
  topics: (string | null)[],
  chunkSize: number,
  isBnb: boolean,
  alchemyRpc: string
): Promise<Array<{ topics: string[]; data: string }>> {
  const allLogs: Array<{ topics: string[]; data: string }> = [];
  for (let cursor = fromBlock; cursor <= toBlock; cursor += chunkSize) {
    const chunkEnd = Math.min(cursor + chunkSize - 1, toBlock);
    const fromHex = "0x" + cursor.toString(16);
    const toHex = "0x" + chunkEnd.toString(16);

    let logs: Array<{ topics: string[]; data: string }>;
    if (isBnb) {
      logs = await bnbGetLogs(alchemyRpc, tokenAddress, fromHex, toHex, topics);
    } else {
      logs = await getLogs(rpcUrl, tokenAddress, fromHex, toHex, topics);
    }
    allLogs.push(...logs);

    if (cursor + chunkSize <= toBlock) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return allLogs;
}

// BNB getLogs with public RPC fallback
async function bnbGetLogs(
  alchemyRpc: string,
  tokenAddress: string,
  fromBlock: string,
  toBlock: string,
  topics: (string | null)[]
): Promise<Array<{ topics: string[]; data: string }>> {
  const result = await getLogs(alchemyRpc, tokenAddress, fromBlock, toBlock, topics);
  if (result.length > 0) return result;

  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallback = await getLogs(rpc, tokenAddress, fromBlock, toBlock, topics);
      if (fallback.length > 0) return fallback;
    } catch {
      continue;
    }
  }
  return result;
}

// Aggregate Transfer logs into per-wallet totals
function aggregateLogs(
  logs: Array<{ topics: string[]; data: string }>,
  extractAddressFromTopicIndex: number // 1 = from (topic[1]), 2 = to (topic[2])
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of logs) {
    const rawAddr = log.topics[extractAddressFromTopicIndex];
    if (!rawAddr) continue;
    const addr = "0x" + rawAddr.slice(26).toLowerCase();
    const value = hexToNumber(log.data);
    totals.set(addr, (totals.get(addr) || 0) + value);
  }
  return totals;
}

// Merge map b into map a
function mergeMaps(a: Map<string, number>, b: Map<string, number>): void {
  for (const [k, v] of b) {
    a.set(k, (a.get(k) || 0) + v);
  }
}

// Query spent/earned for a block range on a single chain using chunked fetching
async function queryChainTips(
  rpcUrl: string,
  tokenAddress: string,
  contractAddresses: string[],
  fromBlock: number,
  toBlock: number,
  isBnb: boolean,
  alchemyRpc: string
): Promise<{ spent: Map<string, number>; earned: Map<string, number> }> {
  const spent = new Map<string, number>();
  const earned = new Map<string, number>();
  const chunkSize = isBnb ? BNB_CHUNK_SIZE : BASE_CHUNK_SIZE;

  for (const contract of contractAddresses) {
    const paddedContract = padAddress(contract);

    // Spent: Transfer where to = contract (user sent DHB to contract)
    const spentLogs = await getLogsChunked(rpcUrl, tokenAddress, fromBlock, toBlock, [
      TRANSFER_TOPIC,
      null,
      paddedContract,
    ], chunkSize, isBnb, alchemyRpc);

    // Earned: Transfer where from = contract (contract sent DHB to user)
    const earnedLogs = await getLogsChunked(rpcUrl, tokenAddress, fromBlock, toBlock, [
      TRANSFER_TOPIC,
      paddedContract,
      null,
    ], chunkSize, isBnb, alchemyRpc);

    mergeMaps(spent, aggregateLogs(spentLogs, 1));
    mergeMaps(earned, aggregateLogs(earnedLogs, 2));

    console.log(`  Contract ${contract}: ${spentLogs.length} spent logs, ${earnedLogs.length} earned logs`);

    await new Promise((r) => setTimeout(r, 200));
  }

  return { spent, earned };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ error: "ALCHEMY_API_KEY missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    console.log("Starting tip/bounty historical backfill...");

    // Parse optional ?period= query param to run a single period
    const url = new URL(req.url);
    const periodFilter = url.searchParams.get("period"); // day|week|month|year
    const periodsToRun = periodFilter
      ? PERIODS.filter((p) => p.name === periodFilter)
      : PERIODS;

    if (periodFilter && periodsToRun.length === 0) {
      return new Response(
        JSON.stringify({ error: `Invalid period: ${periodFilter}. Use day|week|month|year` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current block numbers
    const [currentBaseBlock, currentBnbBlock] = await Promise.all([
      getCurrentBlockNumber(baseRpc),
      getCurrentBlockNumber(bnbRpc),
    ]);
    console.log(`Current blocks - Base: ${currentBaseBlock}, BNB: ${currentBnbBlock}`);

    const results: { period: string; wallets: number; errors: number }[] = [];

    for (const period of periodsToRun) {
      const targetBaseBlock = currentBaseBlock - (BASE_BLOCKS_PER_DAY * period.daysAgo);
      const targetBnbBlock = currentBnbBlock - (BNB_BLOCKS_PER_DAY * period.daysAgo);

      if (targetBaseBlock < 0 || targetBnbBlock < 0) {
        console.log(`Skipping ${period.name}: block would be negative`);
        results.push({ period: period.name, wallets: 0, errors: 0 });
        continue;
      }

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - period.daysAgo);
      const dateStr = targetDate.toISOString().split("T")[0];

      console.log(`\nProcessing ${period.name} (${dateStr})...`);
      console.log(`  Block range - Base: ${targetBaseBlock} to ${currentBaseBlock} (${currentBaseBlock - targetBaseBlock} blocks, chunk ${BASE_CHUNK_SIZE})`);
      console.log(`  Block range - BNB: ${targetBnbBlock} to ${currentBnbBlock} (${currentBnbBlock - targetBnbBlock} blocks, chunk ${BNB_CHUNK_SIZE})`);

      // Query both chains with chunked fetching
      const baseResult = await queryChainTips(
        baseRpc, DHB_BASE,
        [BASE_TIP_CONTRACT],
        targetBaseBlock, currentBaseBlock,
        false, baseRpc
      );

      const bnbResult = await queryChainTips(
        bnbRpc, DHB_BNB,
        [BNB_TIP_CONTRACT, BNB_BOUNTY_CONTRACT],
        targetBnbBlock, currentBnbBlock,
        true, bnbRpc
      );

      // Merge cross-chain totals
      const totalSpent = new Map<string, number>();
      const totalEarned = new Map<string, number>();
      mergeMaps(totalSpent, baseResult.spent);
      mergeMaps(totalSpent, bnbResult.spent);
      mergeMaps(totalEarned, baseResult.earned);
      mergeMaps(totalEarned, bnbResult.earned);

      // Merge direct tips from tip_records table
      const { data: dbTips } = await supabase
        .from("tip_records")
        .select("sender_address, receiver_address, amount")
        .gte("created_at", new Date(targetDate).toISOString());

      if (dbTips && dbTips.length > 0) {
        for (const tip of dbTips) {
          const sender = tip.sender_address.toLowerCase();
          const receiver = tip.receiver_address.toLowerCase();
          const amt = Number(tip.amount);
          totalSpent.set(sender, (totalSpent.get(sender) || 0) + amt);
          totalEarned.set(receiver, (totalEarned.get(receiver) || 0) + amt);
        }
        console.log(`  Merged ${dbTips.length} direct tips from database`);
      }

      const allWallets = new Set([...totalSpent.keys(), ...totalEarned.keys()]);
      console.log(`${period.name}: ${allWallets.size} unique wallets with tip/bounty activity`);

      if (allWallets.size === 0) {
        results.push({ period: period.name, wallets: 0, errors: 0 });
        continue;
      }

      // UPDATE only sent_tips and received_tips on existing snapshot rows
      // Never create new rows or touch balance/followers/likes/subscribers
      const walletArr = [...allWallets];
      let errorCount = 0;
      let updatedCount = 0;

      for (const wallet of walletArr) {
        const addr = wallet.toLowerCase();
        const { error: updateErr, count } = await supabase
          .from("leaderboard_snapshots")
          .update({
            sent_tips: totalSpent.get(wallet) || 0,
            received_tips: totalEarned.get(wallet) || 0,
          })
          .eq("account", addr)
          .eq("snapshot_date", dateStr);

        if (updateErr) {
          console.error(`Update error for ${addr}:`, updateErr);
          errorCount++;
        } else if (count && count > 0) {
          updatedCount++;
        }
      }

      console.log(`${period.name} done: ${allWallets.size} wallets, ${errorCount} errors`);
      results.push({ period: period.name, wallets: allWallets.size, errors: errorCount });
    }

    console.log("\nBackfill complete!", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, message: "Tip/bounty backfill complete", results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
