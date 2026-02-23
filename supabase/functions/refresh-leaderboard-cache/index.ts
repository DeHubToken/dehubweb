import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Contract addresses ──────────────────────────────────────────────
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6"; // BNB only

// Tip & bounty contracts (for Transfer event tracing)
const BASE_TIP_CONTRACT = "0x4fa30dAef50c6dc8593470750F3c721CA3275581";
const BNB_TIP_CONTRACT = "0x6E19ba22da239C46941582530c0Ef61400B0e3e6";
const BNB_BOUNTY_CONTRACT = "0x9f8012074d27F8596C0E5038477ACB52057BC934";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Function selectors
const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const USER_INFOS_SELECTOR = "0x43b0215f"; // userInfos(address) → first slot = totalAmount

// Public BNB RPCs as fallback
const BNB_PUBLIC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

// ── DeHub API (for address list + profile data) ─────────────────────
const DEHUB_API_BASE = "https://api.dehub.io";
const API_SORT_MODES = ["sentTips", "receivedTips"] as const;
const PERIODS = ["day", "week", "month", "year", "all"] as const;

// Minimum DHB balance to include from discovery (10,000 DHB)
const DISCOVERY_MIN_BALANCE = 10_000;

// Period to days-ago mapping for snapshot deltas
const PERIOD_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

// ── Helpers ─────────────────────────────────────────────────────────

function padAddress(address: string): string {
  return "0x" + address.replace("0x", "").toLowerCase().padStart(64, "0");
}

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

/** Parse first 32-byte slot from hex return data (for tuple returns like userInfos) */
function hexFirstSlotToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    const firstSlot = hex.length >= 66 ? "0x" + hex.slice(2, 66) : hex;
    return Number(BigInt(firstSlot)) / 1e18;
  } catch {
    return 0;
  }
}

// Block time estimates for historical queries
const BASE_BLOCKS_PER_DAY = 43200; // ~2 sec/block
const BNB_BLOCKS_PER_DAY = 28800;  // ~3 sec/block

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
    console.error(
      `[rpc-error] to=${to} block=${blockTag} data=${data.slice(0, 10)} error=`,
      json.error
    );
  }
  return json.result || "0x0";
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

// ── Transfer event log helpers (for tip/bounty tracking) ────────────

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
      jsonrpc: "2.0", id: 1, method: "eth_getLogs",
      params: [{ address: tokenAddress, fromBlock, toBlock, topics }],
    }),
  });
  const json = await res.json();
  if (json.error) {
    console.error(`[getLogs-error] token=${tokenAddress}`, json.error);
    return [];
  }
  return json.result || [];
}

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
    } catch { continue; }
  }
  return result;
}

function aggregateTransferLogs(
  logs: Array<{ topics: string[]; data: string }>,
  topicIndex: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const log of logs) {
    const rawAddr = log.topics[topicIndex];
    if (!rawAddr) continue;
    const addr = "0x" + rawAddr.slice(26).toLowerCase();
    const value = hexToNumber(log.data);
    totals.set(addr, (totals.get(addr) || 0) + value);
  }
  return totals;
}

function mergeMaps(a: Map<string, number>, b: Map<string, number>): void {
  for (const [k, v] of b) {
    a.set(k, (a.get(k) || 0) + v);
  }
}

/** Query tip/bounty Transfer events for a block range, returns spent/earned per wallet */
async function queryTipEvents(
  baseRpc: string,
  bnbRpc: string,
  baseFromBlock: string,
  bnbFromBlock: string,
): Promise<{ spent: Map<string, number>; earned: Map<string, number> }> {
  const spent = new Map<string, number>();
  const earned = new Map<string, number>();

  // Base: single contract covers tips + bounties
  const basePadded = padAddress(BASE_TIP_CONTRACT);
  const [baseSpentLogs, baseEarnedLogs] = await Promise.all([
    getLogs(baseRpc, DHB_BASE, baseFromBlock, "latest", [TRANSFER_TOPIC, null, basePadded]),
    getLogs(baseRpc, DHB_BASE, baseFromBlock, "latest", [TRANSFER_TOPIC, basePadded, null]),
  ]);
  mergeMaps(spent, aggregateTransferLogs(baseSpentLogs, 1));
  mergeMaps(earned, aggregateTransferLogs(baseEarnedLogs, 2));
  console.log(`  Base tip logs: ${baseSpentLogs.length} spent, ${baseEarnedLogs.length} earned`);

  // BNB: tip contract
  const bnbTipPadded = padAddress(BNB_TIP_CONTRACT);
  const [bnbTipSpent, bnbTipEarned] = await Promise.all([
    bnbGetLogs(bnbRpc, DHB_BNB, bnbFromBlock, "latest", [TRANSFER_TOPIC, null, bnbTipPadded]),
    bnbGetLogs(bnbRpc, DHB_BNB, bnbFromBlock, "latest", [TRANSFER_TOPIC, bnbTipPadded, null]),
  ]);
  mergeMaps(spent, aggregateTransferLogs(bnbTipSpent, 1));
  mergeMaps(earned, aggregateTransferLogs(bnbTipEarned, 2));
  console.log(`  BNB tip logs: ${bnbTipSpent.length} spent, ${bnbTipEarned.length} earned`);

  await new Promise((r) => setTimeout(r, 200));

  // BNB: bounty (StreamController) contract
  const bnbBountyPadded = padAddress(BNB_BOUNTY_CONTRACT);
  const [bnbBountySpent, bnbBountyEarned] = await Promise.all([
    bnbGetLogs(bnbRpc, DHB_BNB, bnbFromBlock, "latest", [TRANSFER_TOPIC, null, bnbBountyPadded]),
    bnbGetLogs(bnbRpc, DHB_BNB, bnbFromBlock, "latest", [TRANSFER_TOPIC, bnbBountyPadded, null]),
  ]);
  mergeMaps(spent, aggregateTransferLogs(bnbBountySpent, 1));
  mergeMaps(earned, aggregateTransferLogs(bnbBountyEarned, 2));
  console.log(`  BNB bounty logs: ${bnbBountySpent.length} spent, ${bnbBountyEarned.length} earned`);

  return { spent, earned };
}


async function bnbRpcCall(
  alchemyBnbRpc: string,
  to: string,
  data: string,
  blockTag: string = "latest"
): Promise<string> {
  const result = await rpcCall(alchemyBnbRpc, to, data, blockTag);
  if (result && result !== "0x0" && result !== "0x") {
    return result;
  }

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

/** Get on-chain DHB total for a single address, optionally at a specific block */
async function getOnChainBalance(
  address: string,
  baseRpc: string,
  bnbRpc: string,
  baseBlock: string = "latest",
  bnbBlock: string = "latest"
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

/** Fetch the DeHub leaderboard for a given sort/period */
async function fetchDeHubLeaderboard(
  sort: string,
  period: string
): Promise<unknown> {
  const params = new URLSearchParams({ sort });
  if (period !== "all") params.set("period", period);

  const response = await fetch(
    `${DEHUB_API_BASE}/api/leaderboard?${params.toString()}`,
    { headers: { "Content-Type": "application/json" } }
  );

  if (!response.ok)
    throw new Error(`DeHub leaderboard fetch failed: ${response.status}`);
  return response.json();
}

// ── Enriched entry type ─────────────────────────────────────────────
interface EnrichedEntry {
  account: string;
  total: number;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  sentTips: number;
  receivedTips: number;
  followers?: number;
  likes?: number;
  subscribers?: number;
  delta?: number;
  badgeBalance?: number;
}

// ── Wallets excluded from the holdings leaderboard ─────────────────
// Wallets excluded from period-based holdings (1d/1w/1m/1y) but kept in All Time
const HOLDINGS_PERIOD_EXCLUDED = new Set([
  "0x9324840523a5d17dd12a2f11a9472e5a199c1937", // mal (founder) — tokens in smart contract, balance hasn't changed
]);

// ── Extra wallets to include (username -> wallet address) ───────────
// These wallets are queried on-chain and injected into the holdings leaderboard
const EXTRA_WALLETS: Record<string, { wallet: string; displayName?: string; avatarUrl?: string }> = {
  outoforrder: { wallet: "0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5", displayName: "outoforrder", avatarUrl: "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5.jpeg" },
  sixseven: { wallet: "0x1451ec8a6d19b0544bb21b3ba66810bc10ed41e7", displayName: "sixseven" },
  lowkeyfr: { wallet: "0xcdda8166c4eec11277ab0575fd54785fb321b1a6", displayName: "lowkeyfr" },
  waifu: { wallet: "0xb4ba0e4b4596b7e8a074fe6156d4f666ebdba000", displayName: "waifu" },
  jimminycrockett: { wallet: "0x388bee96cdb67bed580adf54ee8dc5b0adfe8d79", displayName: "jimminycrockett" },
};

// Set of extra wallet addresses for quick lookup (used to ensure they appear in period deltas)
const EXTRA_WALLET_ADDRESSES = new Set(
  Object.values(EXTRA_WALLETS).map(w => w.wallet.toLowerCase())
);

// ── Snapshot-based delta helper (used by light mode) ────────────────

interface SnapshotDeltaResult {
  sort: string;
  period: string;
  success: boolean;
  error?: string;
}

/** Compute delta for a given sort/period using only DB snapshots — no RPC/API calls */
async function computeSnapshotDelta(
  supabase: any,
  allEntries: EnrichedEntry[],
  sortMode: string,
  period: string,
): Promise<SnapshotDeltaResult> {
  try {
    const daysAgo = PERIOD_DAYS[period];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysAgo);
    const pastDateStr = pastDate.toISOString().split("T")[0];

    // Find closest valid snapshot date on or before target (with quality guard)
    // Check both total count AND non-zero entries for the relevant field
    const MIN_SNAPSHOT_ENTRIES = 10;
    const MIN_NONZERO_RATIO = 0.3; // at least 30% of entries must have non-zero values
    const { data: candidateSnaps } = await supabase
      .from("leaderboard_snapshots")
      .select("snapshot_date")
      .lte("snapshot_date", pastDateStr)
      .order("snapshot_date", { ascending: false })
      .limit(10); // fetch several candidates to skip corrupted ones

    // Determine which DB column to check for non-zero quality
    let qualityField: string;
    if (sortMode === "holdings") qualityField = "balance";
    else if (sortMode === "sentTips") qualityField = "sent_tips";
    else if (sortMode === "receivedTips") qualityField = "received_tips";
    else qualityField = sortMode; // followers, likes, subscribers

    let closestDate: string | null = null;
    if (candidateSnaps) {
      // Deduplicate dates
      const uniqueDates = [...new Set(candidateSnaps.map(s => s.snapshot_date))];
      for (const candidateDate of uniqueDates) {
        // Count total entries for this snapshot date
        const { count: totalCount } = await supabase
          .from("leaderboard_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("snapshot_date", candidateDate);

        if (totalCount === null || totalCount < MIN_SNAPSHOT_ENTRIES) {
          console.warn(`[light] ${sortMode}/${period}: skipping snapshot ${candidateDate} — only ${totalCount} entries (min ${MIN_SNAPSHOT_ENTRIES})`);
          continue;
        }

        // For holdings, also check that enough entries have non-zero balance
        if (sortMode === "holdings") {
          const { count: nonZeroCount } = await supabase
            .from("leaderboard_snapshots")
            .select("id", { count: "exact", head: true })
            .eq("snapshot_date", candidateDate)
            .gt("balance", 0);

          const ratio = (nonZeroCount ?? 0) / totalCount;
          if (ratio < MIN_NONZERO_RATIO) {
            console.warn(`[light] ${sortMode}/${period}: skipping snapshot ${candidateDate} — only ${nonZeroCount}/${totalCount} non-zero balances (${(ratio * 100).toFixed(0)}%, min ${MIN_NONZERO_RATIO * 100}%)`);
            continue;
          }
        }

        closestDate = candidateDate;
        console.log(`[light] ${sortMode}/${period}: using snapshot ${candidateDate} with ${totalCount} entries`);
        break;
      }
    }

    const pastMap = new Map<string, number>();

    if (closestDate) {
      // Determine which field to read from snapshots
      let snapshotField: string;
      if (sortMode === "holdings") snapshotField = "balance";
      else if (sortMode === "sentTips") snapshotField = "sent_tips";
      else if (sortMode === "receivedTips") snapshotField = "received_tips";
      else snapshotField = sortMode; // followers, likes, subscribers

      const { data: snapshots } = await supabase
        .from("leaderboard_snapshots")
        .select(`account, ${snapshotField}`)
        .eq("snapshot_date", closestDate);

      if (snapshots) {
        for (const snap of snapshots) {
          pastMap.set(snap.account.toLowerCase(), (snap as any)[snapshotField] ?? 0);
        }
      }
      console.log(`[light] ${sortMode}/${period}: snapshot from ${closestDate}, ${pastMap.size} entries`);
    } else {
      console.log(`[light] ${sortMode}/${period}: no valid snapshot found for ${pastDateStr} (all candidates below ${MIN_SNAPSHOT_ENTRIES} entries)`);
    }

    // Determine the current value field on entries
    const getEntryValue = (entry: EnrichedEntry): number => {
      if (sortMode === "holdings") return entry.total;
      if (sortMode === "sentTips") return entry.sentTips;
      if (sortMode === "receivedTips") return entry.receivedTips;
      return (entry as any)[sortMode] ?? 0;
    };

    // For sentTips/receivedTips, we need current snapshot values instead of the all-time cache values
    let currentMap: Map<string, number> | null = null;
    if (sortMode === "sentTips" || sortMode === "receivedTips") {
      const snapshotField = sortMode === "sentTips" ? "sent_tips" : "received_tips";
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: currentSnaps } = await supabase
        .from("leaderboard_snapshots")
        .select(`account, ${snapshotField}`)
        .eq("snapshot_date", todayStr);

      if (currentSnaps && currentSnaps.length > 0) {
        currentMap = new Map<string, number>();
        for (const snap of currentSnaps) {
          currentMap.set(snap.account.toLowerCase(), (snap as any)[snapshotField] ?? 0);
        }
      }
    }

    // For short periods (day/week), only count real deltas for social metrics
    const requireRealPast = (period === "day" || period === "week") &&
      ["followers", "likes", "subscribers"].includes(sortMode);

    // Filter entries for holdings period exclusion
    const entries = sortMode === "holdings"
      ? allEntries.filter(e => !HOLDINGS_PERIOD_EXCLUDED.has(e.account.toLowerCase()))
      : allEntries;

    const withDeltas: EnrichedEntry[] = entries
      .filter((e) => {
        if (sortMode === "followers" || sortMode === "likes" || sortMode === "subscribers") {
          return (e[sortMode as keyof EnrichedEntry] as number ?? 0) > 0;
        }
        return true;
      })
      .map((entry) => {
        const addr = entry.account.toLowerCase();
        let currentVal: number;
        if (currentMap) {
          currentVal = currentMap.get(addr) || 0;
        } else {
          currentVal = getEntryValue(entry);
        }
        const pastVal = pastMap.get(addr);
        const isExtraWallet = EXTRA_WALLET_ADDRESSES.has(addr);

        let delta: number;
        if (requireRealPast) {
          const hasTruePastData = pastVal !== undefined && pastVal > 0;
          delta = hasTruePastData ? currentVal - pastVal : 0;
        } else if (pastVal !== undefined) {
          delta = currentVal - pastVal;
        } else if (isExtraWallet && currentVal > 0) {
          // Extra wallets missing from past snapshot: treat past as 0
          delta = currentVal;
        } else {
          delta = 0;
        }
        return { ...entry, delta };
      });

    const sorted = withDeltas
      .filter((e) => e.delta !== undefined && e.delta > 0)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

    const periodData = {
      result: { byWalletBalance: sorted },
      hasHistoricalData: pastMap.size > 0,
    };

    const { error } = await supabase.from("leaderboard_cache").upsert(
      {
        sort_mode: sortMode,
        period,
        data: periodData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sort_mode,period" }
    );

    if (error) {
      console.error(`Error caching ${sortMode}/${period}:`, error);
      return { sort: sortMode, period, success: false, error: error.message };
    }
    console.log(`[light] ${sortMode}/${period}: ${sorted.length} entries with positive delta`);
    return { sort: sortMode, period, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error computing ${sortMode}/${period}:`, msg);
    return { sort: sortMode, period, success: false, error: msg };
  }
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse mode from request body (default: "full" for backwards compatibility)
    let mode = "full";
    try {
      const body = await req.json();
      if (body?.mode === "light") mode = "light";
    } catch {
      // No body or invalid JSON — default to full
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: {
      sort: string;
      period: string;
      success: boolean;
      error?: string;
    }[] = [];

    // ================================================================
    // LIGHT MODE: Only recompute day/week caches using existing snapshots
    // No RPC calls, no API calls. Pure DB reads + cache writes.
    // ================================================================
    if (mode === "light") {
      console.log("Starting LIGHT leaderboard cache refresh (snapshot-based)...");

      // Load the existing "all" holdings cache (has profile data + current balances)
      const { data: holdingsCache } = await supabase
        .from("leaderboard_cache")
        .select("data")
        .eq("sort_mode", "holdings")
        .eq("period", "all")
        .single();

      const allEntries: EnrichedEntry[] = (holdingsCache?.data as any)?.result?.byWalletBalance ?? [];

      if (allEntries.length === 0) {
        console.warn("[light] No holdings/all cache found — cannot compute deltas. Run a full refresh first.");
        return new Response(
          JSON.stringify({ success: false, mode: "light", error: "No holdings/all cache available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      console.log(`[light] Using ${allEntries.length} entries from holdings/all cache`);

      // Recompute day + week for all sort modes
      const LIGHT_PERIODS = ["day", "week", "month", "year"] as const;
      const ALL_SORT_MODES = ["holdings", "followers", "likes", "subscribers", "sentTips", "receivedTips"] as const;

      for (const sortMode of ALL_SORT_MODES) {
        for (const period of LIGHT_PERIODS) {
          const result = await computeSnapshotDelta(supabase, allEntries, sortMode, period);
          results.push(result);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`LIGHT refresh complete: ${successCount}/${results.length} successful`);

      return new Response(
        JSON.stringify({
          success: true,
          mode: "light",
          message: `Light refresh: cached ${successCount}/${results.length} combinations`,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ================================================================
    // FULL MODE: Everything — on-chain, API, snapshots, all periods
    // ================================================================
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");

    if (!alchemyKey) {
      console.error("ALCHEMY_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "ALCHEMY_API_KEY missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    console.log("Starting FULL leaderboard cache refresh...");

    // ────────────────────────────────────────────────────────────────
    // 1. ON-CHAIN HOLDINGS LEADERBOARD
    // ────────────────────────────────────────────────────────────────
    try {
      console.log("Fetching holdings leaderboard (on-chain)...");

      const dehubData = (await fetchDeHubLeaderboard(
        "holdings",
        "all"
      )) as {
        result?: { byWalletBalance?: Array<Record<string, unknown>> };
      };

      const rawEntries = dehubData?.result?.byWalletBalance ?? [];
      console.log(`Got ${rawEntries.length} addresses from DeHub`);

      const BATCH_SIZE = 5;
      const enriched: EnrichedEntry[] = [];

      for (let i = 0; i < rawEntries.length; i += BATCH_SIZE) {
        const batch = rawEntries.slice(i, i + BATCH_SIZE);
        const balances = await Promise.all(
          batch.map((entry) =>
            getOnChainBalance(
              (entry.account as string) || "",
              baseRpc,
              bnbRpc
            )
          )
        );

        batch.forEach((entry, idx) => {
          const onChainBalance = balances[idx];
          const apiTotal = (entry.total as number) ?? 0;
          const effectiveBalance = onChainBalance > 0 ? onChainBalance : apiTotal;
          enriched.push({
            account: (entry.account as string) || "",
            total: effectiveBalance,
            username: (entry.username as string) || undefined,
            userDisplayName: (entry.userDisplayName as string) || undefined,
            avatarUrl: (entry.avatarUrl as string) || undefined,
            sentTips: (entry.sentTips as number) ?? 0,
            receivedTips: (entry.receivedTips as number) ?? 0,
            followers: (entry.followers as number) ?? undefined,
            likes: (entry.likes as number) ?? undefined,
            subscribers: (entry.subscribers as number) ?? undefined,
            badgeBalance: effectiveBalance,
          });
        });

        if (i + BATCH_SIZE < rawEntries.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      // ── Inject extra wallets ──────────────────────────────────────
      const existingAccounts = new Set(enriched.map(e => e.account.toLowerCase()));
      for (const [username, config] of Object.entries(EXTRA_WALLETS)) {
        if (!existingAccounts.has(config.wallet.toLowerCase())) {
          try {
            const balance = await getOnChainBalance(config.wallet, baseRpc, bnbRpc);
            if (balance > 0) {
              enriched.push({
                account: config.wallet.toLowerCase(),
                total: balance,
                username,
                userDisplayName: config.displayName,
                avatarUrl: config.avatarUrl,
                sentTips: 0,
                receivedTips: 0,
                badgeBalance: balance,
              });
              console.log(`Extra wallet ${username} (${config.wallet}): ${balance}`);
            }
          } catch (err) {
            console.error(`Failed to query extra wallet ${username}:`, err);
          }
        }
      }

      enriched.sort((a, b) => b.total - a.total);
      // Deduplicate by lowercased address (keep first = highest balance)
      const seenAddrs = new Set<string>();
      const deduped = enriched.filter(e => {
        const addr = e.account.toLowerCase();
        if (seenAddrs.has(addr)) return false;
        seenAddrs.add(addr);
        return true;
      });
      const nonZero = deduped;
      const nonZeroPeriod = enriched.filter(e => !HOLDINGS_PERIOD_EXCLUDED.has(e.account.toLowerCase()));

      console.log(`On-chain holdings: ${nonZero.length} total holders`);

      // Get current block numbers (needed for snapshots)
      const [currentBaseBlock, currentBnbBlock] = await Promise.all([
        getCurrentBlockNumber(baseRpc),
        getCurrentBlockNumber(bnbRpc),
      ]);
      console.log(`Current blocks - Base: ${currentBaseBlock}, BNB: ${currentBnbBlock}`);

      // ── Snapshot: upsert today's balances + tip data (once per day) ──
      const today = new Date().toISOString().split("T")[0];

      const { count: snapshotCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", today);

      let todaySpent = new Map<string, number>();
      let todayEarned = new Map<string, number>();
      if (!snapshotCount || snapshotCount === 0) {
        try {
          const oneDayBaseBlock = "0x" + (currentBaseBlock - BASE_BLOCKS_PER_DAY).toString(16);
          const oneDayBnbBlock = "0x" + (currentBnbBlock - BNB_BLOCKS_PER_DAY).toString(16);
          console.log("Querying tip/bounty events for today's snapshot...");
          const tipResult = await queryTipEvents(baseRpc, bnbRpc, oneDayBaseBlock, oneDayBnbBlock);
          todaySpent = tipResult.spent;
          todayEarned = tipResult.earned;
        } catch (tipErr) {
          console.error("Tip event query failed (non-fatal):", tipErr);
        }
      }
      if (!snapshotCount || snapshotCount === 0) {
        console.log(`Creating daily snapshot for ${today}...`);
        const snapshotRows = nonZero.map((e) => ({
          account: e.account.toLowerCase(),
          balance: e.total,
          followers: e.followers ?? 0,
          likes: e.likes ?? 0,
          subscribers: e.subscribers ?? 0,
          sent_tips: todaySpent.get(e.account.toLowerCase()) || 0,
          received_tips: todayEarned.get(e.account.toLowerCase()) || 0,
          snapshot_date: today,
        }));

        for (let i = 0; i < snapshotRows.length; i += 100) {
          const batch = snapshotRows.slice(i, i + 100);
          const { error: snapErr } = await supabase
            .from("leaderboard_snapshots")
            .upsert(batch, { onConflict: "account,snapshot_date" });
          if (snapErr) {
            console.error(`Snapshot upsert error (batch ${i}):`, snapErr);
          }
        }
        console.log(`Snapshot saved: ${snapshotRows.length} entries`);

        try {
          await supabase.rpc("cleanup_old_leaderboard_snapshots");
          console.log("Old snapshots cleaned up");
        } catch (cleanupErr) {
          console.error("Snapshot cleanup error:", cleanupErr);
        }
      } else {
        console.log(`Snapshot for ${today} already exists, skipping`);
      }

      // ── Cache "all" period ───
      const allTimeData = {
        result: { byWalletBalance: nonZero },
      };

      const { error: allErr } = await supabase.from("leaderboard_cache").upsert(
        {
          sort_mode: "holdings",
          period: "all",
          data: allTimeData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sort_mode,period" }
      );

      if (allErr) {
        console.error("Error caching holdings/all:", allErr);
        results.push({ sort: "holdings", period: "all", success: false, error: allErr.message });
      } else {
        results.push({ sort: "holdings", period: "all", success: true });
      }

      // ── Cache time-based periods using snapshot deltas ──
      for (const period of ["day", "week", "month", "year"] as const) {
        const result = await computeSnapshotDelta(supabase, nonZeroPeriod, "holdings", period);
        results.push(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Error building on-chain holdings leaderboard:", msg);
      PERIODS.forEach((period) =>
        results.push({ sort: "holdings", period, success: false, error: msg })
      );
    }

    // ────────────────────────────────────────────────────────────────
    // 2. SOCIAL METRICS (followers, likes, subscribers) with time-based deltas
    // ────────────────────────────────────────────────────────────────
    const SOCIAL_METRICS = ["followers", "likes", "subscribers"] as const;

    try {
      const { data: holdingsCache } = await supabase
        .from("leaderboard_cache")
        .select("data")
        .eq("sort_mode", "holdings")
        .eq("period", "all")
        .single();

      const allEntries: EnrichedEntry[] = (holdingsCache?.data as any)?.result?.byWalletBalance ?? [];

      for (const metric of SOCIAL_METRICS) {
        // "all" period: sort by current value
        const sortedAll = [...allEntries]
          .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));

        const allData = {
          result: { byWalletBalance: sortedAll },
        };

        const { error: allMetricErr } = await supabase.from("leaderboard_cache").upsert(
          {
            sort_mode: metric,
            period: "all",
            data: allData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sort_mode,period" }
        );

        if (allMetricErr) {
          console.error(`Error caching ${metric}/all:`, allMetricErr);
          results.push({ sort: metric, period: "all", success: false, error: allMetricErr.message });
        } else {
          console.log(`${metric}/all: ${sortedAll.length} entries`);
          results.push({ sort: metric, period: "all", success: true });
        }

        // Time-based periods: use shared delta helper
        for (const period of ["day", "week", "month", "year"] as const) {
          const result = await computeSnapshotDelta(supabase, allEntries, metric, period);
          results.push(result);
        }
      }
    } catch (socialErr) {
      const msg = socialErr instanceof Error ? socialErr.message : "Unknown error";
      console.error("Error building social metrics leaderboards:", msg);
      for (const metric of SOCIAL_METRICS) {
        PERIODS.forEach((period) =>
          results.push({ sort: metric, period, success: false, error: msg })
        );
      }
    }

    // ────────────────────────────────────────────────────────────────
    // 3. TIP/BOUNTY CATEGORIES (sentTips, receivedTips) - API + snapshot deltas
    // ────────────────────────────────────────────────────────────────
    try {
      // "all" period: use DeHub API
      for (const sort of API_SORT_MODES) {
        try {
          console.log(`Fetching ${sort}/all from API...`);
          const data = await fetchDeHubLeaderboard(sort, "all");
          const { error } = await supabase.from("leaderboard_cache").upsert(
            { sort_mode: sort, period: "all", data, updated_at: new Date().toISOString() },
            { onConflict: "sort_mode,period" }
          );
          if (error) {
            console.error(`Error caching ${sort}/all:`, error);
            results.push({ sort, period: "all", success: false, error: error.message });
          } else {
            results.push({ sort, period: "all", success: true });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error fetching ${sort}/all:`, msg);
          results.push({ sort, period: "all", success: false, error: msg });
        }
      }

      // Time-based periods: use snapshot deltas
      const { data: holdingsCacheForTips } = await supabase
        .from("leaderboard_cache")
        .select("data")
        .eq("sort_mode", "holdings")
        .eq("period", "all")
        .single();

      const allEntriesForTips: EnrichedEntry[] = (holdingsCacheForTips?.data as any)?.result?.byWalletBalance ?? [];

      for (const tipSort of ["sentTips", "receivedTips"] as const) {
        for (const period of ["day", "week", "month", "year"] as const) {
          const result = await computeSnapshotDelta(supabase, allEntriesForTips, tipSort, period);
          results.push(result);
        }
      }
    } catch (tipErr) {
      const msg = tipErr instanceof Error ? tipErr.message : "Unknown error";
      console.error("Error building tip leaderboards:", msg);
      for (const sort of API_SORT_MODES) {
        PERIODS.forEach((period) =>
          results.push({ sort, period, success: false, error: msg })
        );
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `FULL leaderboard cache refresh complete: ${successCount}/${results.length} successful`
    );

    return new Response(
      JSON.stringify({
        success: true,
        mode: "full",
        message: `Full refresh: cached ${successCount}/${results.length} leaderboard combinations`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error refreshing leaderboard cache:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
