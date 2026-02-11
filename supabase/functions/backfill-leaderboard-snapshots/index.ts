import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Contract addresses (same as refresh-leaderboard-cache)
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113caf77b61b510f332d5ef4cf5b41a761d";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";

const BALANCE_OF_SELECTOR = "0x70a08231";
const USER_INFOS_SELECTOR = "0x43b0215f";

const BNB_PUBLIC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

// Block time estimates
const BASE_BLOCKS_PER_DAY = 43200; // ~2 sec/block
const BNB_BLOCKS_PER_DAY = 28800;  // ~3 sec/block

const PERIODS = [
  { name: "day", daysAgo: 1 },
  { name: "week", daysAgo: 7 },
  { name: "month", daysAgo: 30 },
  { name: "year", daysAgo: 365 },
];

function encodeCall(selector: string, address: string): string {
  const cleaned = address.replace("0x", "").toLowerCase().padStart(64, "0");
  return selector + cleaned;
}

function hexToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    return Number(BigInt(hex)) / 1e18;
  } catch {
    return 0;
  }
}

function hexFirstSlotToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    const firstSlot = hex.length >= 66 ? "0x" + hex.slice(2, 66) : hex;
    return Number(BigInt(firstSlot)) / 1e18;
  } catch {
    return 0;
  }
}

async function rpcCall(
  rpcUrl: string,
  to: string,
  data: string,
  blockTag: string = "latest"
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, blockTag],
    }),
  });
  const json = await res.json();
  if (json.error) {
    console.error(`[rpc-error] to=${to} block=${blockTag} error=`, json.error);
  }
  return json.result || "0x0";
}

async function bnbRpcCall(
  alchemyBnbRpc: string,
  to: string,
  data: string,
  blockTag: string = "latest"
): Promise<string> {
  const result = await rpcCall(alchemyBnbRpc, to, data, blockTag);
  if (result && result !== "0x0" && result !== "0x") return result;

  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallbackResult = await rpcCall(rpc, to, data, blockTag);
      if (fallbackResult && fallbackResult !== "0x0" && fallbackResult !== "0x") {
        return fallbackResult;
      }
    } catch {
      continue;
    }
  }
  return result;
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

async function getHistoricalBalance(
  address: string,
  baseRpc: string,
  bnbRpc: string,
  baseBlock: string,
  bnbBlock: string
): Promise<number> {
  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);

  const [baseHoldings, bnbHoldings, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData, baseBlock),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData, bnbBlock),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData, bnbBlock),
  ]);

  return (
    hexToNumber(baseHoldings) +
    hexToNumber(bnbHoldings) +
    hexFirstSlotToNumber(bnbStaked)
  );
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

    console.log("Starting historical balance backfill...");

    // 1. Get current holder list from leaderboard_cache (holdings/all)
    const { data: cacheRow, error: cacheErr } = await supabase
      .from("leaderboard_cache")
      .select("data")
      .eq("sort_mode", "holdings")
      .eq("period", "all")
      .single();

    if (cacheErr || !cacheRow) {
      return new Response(
        JSON.stringify({ error: "No holdings/all cache found. Run refresh-leaderboard-cache first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const holders: { account: string }[] =
      (cacheRow.data as any)?.result?.byWalletBalance ?? [];
    console.log(`Found ${holders.length} holders to backfill`);

    // 2. Get current block numbers
    const [currentBaseBlock, currentBnbBlock] = await Promise.all([
      getCurrentBlockNumber(baseRpc),
      getCurrentBlockNumber(bnbRpc),
    ]);
    console.log(`Current blocks - Base: ${currentBaseBlock}, BNB: ${currentBnbBlock}`);

    const results: { period: string; count: number; errors: number }[] = [];

    // 3. Process each period
    for (const period of PERIODS) {
      const targetBaseBlock = currentBaseBlock - (BASE_BLOCKS_PER_DAY * period.daysAgo);
      const targetBnbBlock = currentBnbBlock - (BNB_BLOCKS_PER_DAY * period.daysAgo);

      // Skip if block would be negative (chain didn't exist yet)
      if (targetBaseBlock < 0 || targetBnbBlock < 0) {
        console.log(`Skipping ${period.name}: block would be negative`);
        results.push({ period: period.name, count: 0, errors: 0 });
        continue;
      }

      const baseBlockHex = "0x" + targetBaseBlock.toString(16);
      const bnbBlockHex = "0x" + targetBnbBlock.toString(16);

      // Calculate target date
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - period.daysAgo);
      const dateStr = targetDate.toISOString().split("T")[0];

      console.log(`\nProcessing ${period.name} (${dateStr}): Base block ${targetBaseBlock}, BNB block ${targetBnbBlock}`);

      // Check if snapshots already exist for this date
      const { count: existingCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", dateStr);

      if (existingCount && existingCount > 0) {
        console.log(`Snapshots for ${dateStr} already exist (${existingCount} entries), skipping`);
        results.push({ period: period.name, count: existingCount, errors: 0 });
        continue;
      }

      const BATCH_SIZE = 10;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < holders.length; i += BATCH_SIZE) {
        const batch = holders.slice(i, i + BATCH_SIZE);

        try {
          const balances = await Promise.all(
            batch.map((h) =>
              getHistoricalBalance(h.account, baseRpc, bnbRpc, baseBlockHex, bnbBlockHex)
            )
          );

          const rows = batch.map((h, idx) => ({
            account: h.account.toLowerCase(),
            balance: balances[idx],
            snapshot_date: dateStr,
          }));

          const { error: insertErr } = await supabase
            .from("leaderboard_snapshots")
            .upsert(rows, { onConflict: "account,snapshot_date" });

          if (insertErr) {
            console.error(`Insert error for batch ${i}:`, insertErr);
            errorCount += batch.length;
          } else {
            successCount += batch.length;
          }
        } catch (batchErr) {
          console.error(`Batch ${i} failed:`, batchErr);
          errorCount += batch.length;
        }

        // Rate limit: 200ms between batches
        if (i + BATCH_SIZE < holders.length) {
          await new Promise((r) => setTimeout(r, 200));
        }

        // Log progress every 50 wallets
        if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= holders.length) {
          console.log(`  ${period.name}: ${Math.min(i + BATCH_SIZE, holders.length)}/${holders.length} wallets processed`);
        }
      }

      console.log(`${period.name} complete: ${successCount} success, ${errorCount} errors`);
      results.push({ period: period.name, count: successCount, errors: errorCount });
    }

    console.log("\nBackfill complete!", JSON.stringify(results));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Historical balance backfill complete",
        holders: holders.length,
        results,
      }),
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
