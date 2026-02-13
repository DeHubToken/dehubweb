import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// DHB Token addresses (we query Transfer events on these)
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113caf77b61b510f332d5ef4cf5b41a761d";

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

// Query spent/earned for a block range on a single chain
// Returns { spent: Map<wallet, total>, earned: Map<wallet, total> }
async function queryChainTips(
  rpcUrl: string,
  tokenAddress: string,
  contractAddresses: string[], // tip/bounty contracts to check
  fromBlock: string,
  toBlock: string,
  isBnb: boolean,
  alchemyRpc: string
): Promise<{ spent: Map<string, number>; earned: Map<string, number> }> {
  const spent = new Map<string, number>();
  const earned = new Map<string, number>();

  const fetchLogs = isBnb
    ? (token: string, from: string, to: string, topics: (string | null)[]) =>
        bnbGetLogs(alchemyRpc, token, from, to, topics)
    : (token: string, from: string, to: string, topics: (string | null)[]) =>
        getLogs(rpcUrl, token, from, to, topics);

  for (const contract of contractAddresses) {
    const paddedContract = padAddress(contract);

    // Spent: Transfer where to = contract (user sent DHB to contract)
    const spentLogs = await fetchLogs(tokenAddress, fromBlock, toBlock, [
      TRANSFER_TOPIC,
      null, // from = any user
      paddedContract, // to = contract
    ]);

    // Earned: Transfer where from = contract (contract sent DHB to user)
    const earnedLogs = await fetchLogs(tokenAddress, fromBlock, toBlock, [
      TRANSFER_TOPIC,
      paddedContract, // from = contract
      null, // to = any user
    ]);

    // Aggregate: for spent, extract the sender (topic[1])
    mergeMaps(spent, aggregateLogs(spentLogs, 1));
    // For earned, extract the receiver (topic[2])
    mergeMaps(earned, aggregateLogs(earnedLogs, 2));

    console.log(`  Contract ${contract}: ${spentLogs.length} spent logs, ${earnedLogs.length} earned logs`);

    // Rate limit between contract queries
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

    // Get current block numbers
    const [currentBaseBlock, currentBnbBlock] = await Promise.all([
      getCurrentBlockNumber(baseRpc),
      getCurrentBlockNumber(bnbRpc),
    ]);
    console.log(`Current blocks - Base: ${currentBaseBlock}, BNB: ${currentBnbBlock}`);

    const results: { period: string; wallets: number; errors: number }[] = [];

    for (const period of PERIODS) {
      const targetBaseBlock = currentBaseBlock - (BASE_BLOCKS_PER_DAY * period.daysAgo);
      const targetBnbBlock = currentBnbBlock - (BNB_BLOCKS_PER_DAY * period.daysAgo);

      if (targetBaseBlock < 0 || targetBnbBlock < 0) {
        console.log(`Skipping ${period.name}: block would be negative`);
        results.push({ period: period.name, wallets: 0, errors: 0 });
        continue;
      }

      const baseFromHex = "0x" + targetBaseBlock.toString(16);
      const bnbFromHex = "0x" + targetBnbBlock.toString(16);

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - period.daysAgo);
      const dateStr = targetDate.toISOString().split("T")[0];

      console.log(`\nProcessing ${period.name} (${dateStr})...`);

      // Query both chains
      // Base: single contract for both tips and bounties
      const baseResult = await queryChainTips(
        baseRpc, DHB_BASE,
        [BASE_TIP_CONTRACT],
        baseFromHex, "latest",
        false, baseRpc
      );

      // BNB: separate tip and bounty contracts
      const bnbResult = await queryChainTips(
        bnbRpc, DHB_BNB,
        [BNB_TIP_CONTRACT, BNB_BOUNTY_CONTRACT],
        bnbFromHex, "latest",
        true, bnbRpc
      );

      // Merge cross-chain totals
      const totalSpent = new Map<string, number>();
      const totalEarned = new Map<string, number>();
      mergeMaps(totalSpent, baseResult.spent);
      mergeMaps(totalSpent, bnbResult.spent);
      mergeMaps(totalEarned, baseResult.earned);
      mergeMaps(totalEarned, bnbResult.earned);

      // Get all unique wallets
      const allWallets = new Set([...totalSpent.keys(), ...totalEarned.keys()]);
      console.log(`${period.name}: ${allWallets.size} unique wallets with tip/bounty activity`);

      if (allWallets.size === 0) {
        results.push({ period: period.name, wallets: 0, errors: 0 });
        continue;
      }

      // Upsert into leaderboard_snapshots
      const BATCH_SIZE = 100;
      const walletArr = [...allWallets];
      let errorCount = 0;

      for (let i = 0; i < walletArr.length; i += BATCH_SIZE) {
        const batch = walletArr.slice(i, i + BATCH_SIZE);
        const rows = batch.map((wallet) => ({
          account: wallet.toLowerCase(),
          snapshot_date: dateStr,
          sent_tips: totalSpent.get(wallet) || 0,
          received_tips: totalEarned.get(wallet) || 0,
        }));

        // We use upsert - for wallets that already have a snapshot row
        // (from balance backfill), this updates just the tip columns
        const { error: upsertErr } = await supabase
          .from("leaderboard_snapshots")
          .upsert(rows, { onConflict: "account,snapshot_date" });

        if (upsertErr) {
          console.error(`Upsert error batch ${i}:`, upsertErr);
          errorCount += batch.length;
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
