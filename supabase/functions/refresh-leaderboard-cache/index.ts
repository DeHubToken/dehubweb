import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── On-chain balance helpers (Alchemy RPC) ──────────────────────────
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";
const BALANCE_OF_SELECTOR = "0x70a08231";
const USER_INFOS_SELECTOR = "0x43b0215f";
const BNB_PUBLIC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

function encodeCall(selector: string, address: string): string {
  const cleaned = address.replace("0x", "").toLowerCase().padStart(64, "0");
  return selector + cleaned;
}

function hexToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try { return Number(BigInt(hex)) / 1e18; } catch { return 0; }
}

function hexFirstSlotToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    const firstSlot = hex.length >= 66 ? "0x" + hex.slice(2, 66) : hex;
    return Number(BigInt(firstSlot)) / 1e18;
  } catch { return 0; }
}

async function rpcCall(rpcUrl: string, to: string, data: string, blockTag = "latest"): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, blockTag] }),
  });
  const json = await res.json();
  return json.result || "0x0";
}

async function getCurrentBlockNumber(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const json = await res.json();
  return Number(BigInt(json.result || "0x0"));
}

async function bnbRpcCall(alchemyBnbRpc: string, to: string, data: string, blockTag = "latest"): Promise<string> {
  const result = await rpcCall(alchemyBnbRpc, to, data, blockTag);
  if (result && result !== "0x0" && result !== "0x") return result;
  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallback = await rpcCall(rpc, to, data, blockTag);
      if (fallback && fallback !== "0x0" && fallback !== "0x") return fallback;
    } catch { continue; }
  }
  return result;
}

async function getOnChainBalanceAtBlock(address: string, baseRpc: string, bnbRpc: string, baseBlock = "latest", bnbBlock = "latest"): Promise<number> {
  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);
  const [baseHoldings, bnbHoldings, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData, baseBlock),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData, bnbBlock),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData, bnbBlock),
  ]);
  return hexToNumber(baseHoldings) + hexToNumber(bnbHoldings) + hexFirstSlotToNumber(bnbStaked);
}

async function getOnChainBalance(address: string, baseRpc: string, bnbRpc: string): Promise<number> {
  return getOnChainBalanceAtBlock(address, baseRpc, bnbRpc, "latest", "latest");
}

/** Fetch on-chain balances for a batch of addresses at specific block heights, 10 at a time */
async function batchOnChainBalancesAtBlock(
  addresses: string[],
  baseRpc: string,
  bnbRpc: string,
  baseBlock = "latest",
  bnbBlock = "latest",
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const BATCH = 10;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const balances = await Promise.all(
      batch.map((addr) => getOnChainBalanceAtBlock(addr, baseRpc, bnbRpc, baseBlock, bnbBlock))
    );
    batch.forEach((addr, idx) => result.set(addr.toLowerCase(), balances[idx]));
  }
  return result;
}

/** Fetch on-chain balances for a batch of addresses at latest block, 10 at a time */
async function batchOnChainBalances(
  addresses: string[],
  baseRpc: string,
  bnbRpc: string,
): Promise<Map<string, number>> {
  return batchOnChainBalancesAtBlock(addresses, baseRpc, bnbRpc, "latest", "latest");
}

// ── DeHub API ───────────────────────────────────────────────────────
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

// ── Wallets excluded from period-based holdings ─────────────────────
const HOLDINGS_PERIOD_EXCLUDED = new Set([
  "0x9324840523a5d17dd12a2f11a9472e5a199c1937",
]);

// ── Extra wallets to include ────────────────────────────────────────
const EXTRA_WALLETS: Record<string, { wallet: string; displayName?: string; avatarUrl?: string }> = {
  outoforrder: { wallet: "0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5", displayName: "outoforrder", avatarUrl: "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xf96e30ac710ff61e93f82e2010b7b9852b0a25b5.jpeg" },
  sixseven: { wallet: "0x1451ec8a6d19b0544bb21b3ba66810bc10ed41e7", displayName: "sixseven" },
  lowkeyfr: { wallet: "0xcdda8166c4eec11277ab0575fd54785fb321b1a6", displayName: "lowkeyfr" },
  waifu: { wallet: "0xb4ba0e4b4596b7e8a074fe6156d4f666ebdba000", displayName: "waifu" },
  jimminycrockett: { wallet: "0x388bee96cdb67bed580adf54ee8dc5b0adfe8d79", displayName: "jimminycrockett" },
};

const EXTRA_WALLET_ADDRESSES = new Set(
  Object.values(EXTRA_WALLETS).map(w => w.wallet.toLowerCase())
);

// ── DeHub API helpers ───────────────────────────────────────────────

async function fetchDeHubLeaderboard(sort: string, period: string): Promise<unknown> {
  const params = new URLSearchParams({ sort });
  if (period !== "all") params.set("period", period);
  const response = await fetch(
    `${DEHUB_API_BASE}/api/leaderboard?${params.toString()}`,
    { headers: { "Content-Type": "application/json" } }
  );
  if (!response.ok) throw new Error(`DeHub leaderboard fetch failed: ${response.status}`);
  return response.json();
}

/** Fetch a single user's profile from DeHub API */
async function fetchDeHubUserProfile(account: string): Promise<Record<string, unknown> | null> {
  try {
    // Try account_info endpoint first (returns badgeBalance, balanceData)
    const response = await fetch(
      `${DEHUB_API_BASE}/api/account_info/${account}`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!response.ok) return null;
    const json = await response.json();
    return json?.result ?? json ?? null;
  } catch {
    return null;
  }
}

// ── Snapshot-based delta helper ─────────────────────────────────────

interface SnapshotDeltaResult {
  sort: string;
  period: string;
  success: boolean;
  error?: string;
}

// Block-time constants for historical block estimation
const BASE_BLOCKS_PER_DAY = 43200; // ~2s block time
const BNB_BLOCKS_PER_DAY = 28800;  // ~3s block time

async function computeSnapshotDelta(
  supabase: any,
  allEntries: EnrichedEntry[],
  sortMode: string,
  period: string,
  rpcConfig?: { baseRpc: string; bnbRpc: string },
): Promise<SnapshotDeltaResult> {
  try {
    const daysAgo = PERIOD_DAYS[period];

    const entries = sortMode === "holdings"
      ? allEntries.filter(e => !HOLDINGS_PERIOD_EXCLUDED.has(e.account.toLowerCase()))
      : allEntries;

    // For daily/weekly holdings: pure on-chain comparison (bypass snapshots entirely)
    const useOnChain = sortMode === "holdings" && (period === "day" || period === "week") && rpcConfig;
    // For monthly/yearly holdings: hybrid mode — snapshots for known wallets, on-chain for new ones
    const useHybridOnChain = sortMode === "holdings" && (period === "month" || period === "year") && rpcConfig;

    if (useOnChain) {
      console.log(`[delta] ${sortMode}/${period}: PURE ON-CHAIN mode — fetching current + historical blocks for ${entries.length} addresses...`);

      // Get current block numbers for both chains
      const [baseCurrentBlock, bnbCurrentBlock] = await Promise.all([
        getCurrentBlockNumber(rpcConfig!.baseRpc),
        getCurrentBlockNumber(rpcConfig!.bnbRpc),
      ]);

      // Estimate historical blocks
      const baseHistBlock = Math.max(0, baseCurrentBlock - (BASE_BLOCKS_PER_DAY * daysAgo));
      const bnbHistBlock = Math.max(0, bnbCurrentBlock - (BNB_BLOCKS_PER_DAY * daysAgo));
      const baseHistHex = "0x" + baseHistBlock.toString(16);
      const bnbHistHex = "0x" + bnbHistBlock.toString(16);

      console.log(`[delta] ${sortMode}/${period}: Base current=${baseCurrentBlock}, hist=${baseHistBlock} (${daysAgo}d ago)`);
      console.log(`[delta] ${sortMode}/${period}: BNB current=${bnbCurrentBlock}, hist=${bnbHistBlock} (${daysAgo}d ago)`);

      const addresses = entries.map(e => e.account.toLowerCase());

      // Fetch on-chain balances at BOTH time points
      const [currentMap, pastMap] = await Promise.all([
        batchOnChainBalancesAtBlock(addresses, rpcConfig!.baseRpc, rpcConfig!.bnbRpc, "latest", "latest"),
        batchOnChainBalancesAtBlock(addresses, rpcConfig!.baseRpc, rpcConfig!.bnbRpc, baseHistHex, bnbHistHex),
      ]);

      console.log(`[delta] ${sortMode}/${period}: got ${currentMap.size} current + ${pastMap.size} historical on-chain balances`);

      const withDeltas: EnrichedEntry[] = entries.map((entry) => {
        const addr = entry.account.toLowerCase();
        const currentVal = currentMap.get(addr) || 0;
        const pastVal = pastMap.get(addr) || 0;
        const delta = currentVal - pastVal;
        return { ...entry, delta, total: currentVal, badgeBalance: currentVal };
      });

      // For daily/weekly holdings: show BOTH gains AND losses (non-zero deltas)
      const sorted = withDeltas
        .filter((e) => e.delta !== undefined && e.delta !== 0)
        .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

      const periodData = {
        result: { byWalletBalance: sorted },
        hasHistoricalData: true,
        onChainMode: true,
      };

      const { error } = await supabase.from("leaderboard_cache").upsert(
        { sort_mode: sortMode, period, data: periodData, updated_at: new Date().toISOString() },
        { onConflict: "sort_mode,period" }
      );

      if (error) {
        console.error(`Error caching ${sortMode}/${period}:`, error);
        return { sort: sortMode, period, success: false, error: error.message };
      }
      const gains = sorted.filter(e => (e.delta ?? 0) > 0).length;
      const losses = sorted.filter(e => (e.delta ?? 0) < 0).length;
      console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries with non-zero delta (${gains} gains, ${losses} losses)`);
      return { sort: sortMode, period, success: true };
    }

    // ── Snapshot-based path (with hybrid on-chain for month/year holdings) ──

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysAgo);
    const pastDateStr = pastDate.toISOString().split("T")[0];

    const MIN_SNAPSHOT_ENTRIES = 10;
    const MIN_NONZERO_RATIO = 0.3;
    const { data: candidateSnaps } = await supabase
      .from("leaderboard_snapshots")
      .select("snapshot_date")
      .lte("snapshot_date", pastDateStr)
      .order("snapshot_date", { ascending: false })
      .limit(10);

    let closestDate: string | null = null;
    if (candidateSnaps) {
      const uniqueDates = [...new Set(candidateSnaps.map((s: any) => s.snapshot_date))];
      for (const candidateDate of uniqueDates) {
        const { count: totalCount } = await supabase
          .from("leaderboard_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("snapshot_date", candidateDate);

        if (totalCount === null || totalCount < MIN_SNAPSHOT_ENTRIES) {
          console.warn(`[delta] ${sortMode}/${period}: skipping snapshot ${candidateDate} — only ${totalCount} entries`);
          continue;
        }

        if (sortMode === "holdings") {
          const { count: nonZeroCount } = await supabase
            .from("leaderboard_snapshots")
            .select("id", { count: "exact", head: true })
            .eq("snapshot_date", candidateDate)
            .gt("balance", 0);

          const ratio = (nonZeroCount ?? 0) / totalCount;
          if (ratio < MIN_NONZERO_RATIO) {
            console.warn(`[delta] ${sortMode}/${period}: skipping snapshot ${candidateDate} — only ${(ratio * 100).toFixed(0)}% non-zero`);
            continue;
          }
        }

        closestDate = candidateDate as string;
        console.log(`[delta] ${sortMode}/${period}: using snapshot ${candidateDate} with ${totalCount} entries`);
        break;
      }
    }

    const pastMap = new Map<string, number>();

    if (closestDate) {
      let snapshotField: string;
      if (sortMode === "holdings") snapshotField = "balance";
      else if (sortMode === "sentTips") snapshotField = "sent_tips";
      else if (sortMode === "receivedTips") snapshotField = "received_tips";
      else snapshotField = sortMode;

      const { data: snapshots } = await supabase
        .from("leaderboard_snapshots")
        .select(`account, ${snapshotField}`)
        .eq("snapshot_date", closestDate);

      if (snapshots) {
        for (const snap of snapshots) {
          pastMap.set(snap.account.toLowerCase(), (snap as any)[snapshotField] ?? 0);
        }
      }
      console.log(`[delta] ${sortMode}/${period}: snapshot from ${closestDate}, ${pastMap.size} entries`);
    } else {
      console.log(`[delta] ${sortMode}/${period}: no valid snapshot found for ${pastDateStr}`);
    }

    // ── Hybrid on-chain: fetch historical balances for NEW wallets not in past snapshot ──
    let hybridPastMap: Map<string, number> | null = null;
    if (useHybridOnChain && pastMap.size > 0) {
      const newAddresses = entries
        .map(e => e.account.toLowerCase())
        .filter(addr => !pastMap.has(addr));

      if (newAddresses.length > 0) {
        console.log(`[delta] ${sortMode}/${period}: HYBRID mode — ${pastMap.size} from snapshot, ${newAddresses.length} new wallets need on-chain lookup`);

        try {
          const [baseCurrentBlock, bnbCurrentBlock] = await Promise.all([
            getCurrentBlockNumber(rpcConfig!.baseRpc),
            getCurrentBlockNumber(rpcConfig!.bnbRpc),
          ]);

          const baseHistBlock = Math.max(0, baseCurrentBlock - (BASE_BLOCKS_PER_DAY * daysAgo));
          const bnbHistBlock = Math.max(0, bnbCurrentBlock - (BNB_BLOCKS_PER_DAY * daysAgo));
          const baseHistHex = "0x" + baseHistBlock.toString(16);
          const bnbHistHex = "0x" + bnbHistBlock.toString(16);

          console.log(`[delta] ${sortMode}/${period}: fetching on-chain history for ${newAddresses.length} new holders at blocks Base=${baseHistBlock}, BNB=${bnbHistBlock}`);

          hybridPastMap = await batchOnChainBalancesAtBlock(
            newAddresses, rpcConfig!.baseRpc, rpcConfig!.bnbRpc, baseHistHex, bnbHistHex,
          );

          console.log(`[delta] ${sortMode}/${period}: got ${hybridPastMap.size} historical on-chain balances for new holders`);
        } catch (rpcErr) {
          console.warn(`[delta] ${sortMode}/${period}: hybrid on-chain lookup failed, using snapshot-only:`, rpcErr);
        }
      } else {
        console.log(`[delta] ${sortMode}/${period}: all ${entries.length} wallets found in snapshot, no on-chain needed`);
      }
    }

    const getEntryValue = (entry: EnrichedEntry): number => {
      if (sortMode === "holdings") return entry.total;
      if (sortMode === "sentTips") return entry.sentTips;
      if (sortMode === "receivedTips") return entry.receivedTips;
      return (entry as any)[sortMode] ?? 0;
    };

    const requireRealPast = (period === "day" || period === "week") &&
      ["followers", "likes", "subscribers"].includes(sortMode);

    // Use today's snapshot as "current" for snapshot-based path
    const currentSnapshotFieldMap: Record<string, string> = {
      holdings: "balance",
      sentTips: "sent_tips",
      receivedTips: "received_tips",
      followers: "followers",
      likes: "likes",
      subscribers: "subscribers",
    };
    const currentSnapshotField = currentSnapshotFieldMap[sortMode] || sortMode;
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: currentSnaps } = await supabase
      .from("leaderboard_snapshots")
      .select(`account, ${currentSnapshotField}`)
      .eq("snapshot_date", todayStr);

    let currentMap: Map<string, number> | null = null;
    if (currentSnaps && currentSnaps.length > 0) {
      currentMap = new Map<string, number>();
      for (const snap of currentSnaps) {
        currentMap.set(snap.account.toLowerCase(), (snap as any)[currentSnapshotField] ?? 0);
      }
      console.log(`[delta] ${sortMode}/${period}: using today's snapshot (${currentSnaps.length} entries) for current values`);
    } else {
      console.log(`[delta] ${sortMode}/${period}: no today snapshot found, falling back to API values`);
    }

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

        // Check snapshot first, then hybrid on-chain for new wallets
        let pastVal = pastMap.get(addr);
        if (pastVal === undefined && hybridPastMap) {
          pastVal = hybridPastMap.get(addr);
        }
        const isExtraWallet = EXTRA_WALLET_ADDRESSES.has(addr);

        let delta: number;
        if (requireRealPast) {
          const hasTruePastData = pastVal !== undefined && pastVal > 0;
          delta = hasTruePastData ? currentVal - pastVal! : 0;
        } else if (pastVal !== undefined) {
          delta = currentVal - pastVal;
        } else if (isExtraWallet && currentVal > 0) {
          delta = currentVal;
        } else {
          delta = 0;
        }
        return { ...entry, delta };
      });

    // For month/year holdings with hybrid on-chain: show both gains AND losses like daily/weekly
    const isHybridHoldings = useHybridOnChain && hybridPastMap;
    const sorted = withDeltas
      .filter((e) => e.delta !== undefined && (isHybridHoldings ? e.delta !== 0 : e.delta > 0))
      .sort((a, b) => isHybridHoldings
        ? Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
        : (b.delta ?? 0) - (a.delta ?? 0)
      );

    const periodData = {
      result: { byWalletBalance: sorted },
      hasHistoricalData: pastMap.size > 0 || !!hybridPastMap,
      ...(isHybridHoldings ? { hybridOnChainMode: true } : {}),
    };

    const { error } = await supabase.from("leaderboard_cache").upsert(
      { sort_mode: sortMode, period, data: periodData, updated_at: new Date().toISOString() },
      { onConflict: "sort_mode,period" }
    );

    if (error) {
      console.error(`Error caching ${sortMode}/${period}:`, error);
      return { sort: sortMode, period, success: false, error: error.message };
    }
    if (isHybridHoldings) {
      const gains = sorted.filter(e => (e.delta ?? 0) > 0).length;
      const losses = sorted.filter(e => (e.delta ?? 0) < 0).length;
      console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries (${gains} gains, ${losses} losses) — hybrid on-chain mode`);
    } else {
      console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries with positive delta`);
    }
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
    let mode = "full";
    try {
      const body = await req.json();
      if (body?.mode === "light") mode = "light";
    } catch {
      // No body or invalid JSON — default to full
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build RPC config for on-chain lookups (daily/weekly holdings)
    const rpcConfig = alchemyKey ? {
      baseRpc: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      bnbRpc: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    } : undefined;

    if (!rpcConfig) {
      console.warn("[refresh] ALCHEMY_API_KEY not set — daily/weekly/monthly/yearly holdings will use snapshot-based deltas only");
    }

    const results: { sort: string; period: string; success: boolean; error?: string }[] = [];

    // ================================================================
    // LIGHT MODE: Only recompute period caches using existing snapshots
    // No API calls. Pure DB reads + cache writes.
    // ================================================================
    if (mode === "light") {
      console.log("Starting LIGHT leaderboard cache refresh (snapshot-based)...");

      // Guard: don't recompute if today's snapshot is missing — avoids bad deltas
      const todayStr = new Date().toISOString().split("T")[0];
      const { count: todaySnapCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", todayStr);

      if (!todaySnapCount || todaySnapCount === 0) {
        console.warn("[light] No snapshot for today yet — skipping to avoid bad deltas");
        return new Response(
          JSON.stringify({ success: true, mode: "light", message: "Skipped: no today snapshot yet" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const { data: holdingsCache } = await supabase
        .from("leaderboard_cache")
        .select("data")
        .eq("sort_mode", "holdings")
        .eq("period", "all")
        .single();

      const allEntries: EnrichedEntry[] = (holdingsCache?.data as any)?.result?.byWalletBalance ?? [];

      if (allEntries.length === 0) {
        console.warn("[light] No holdings/all cache found — run a full refresh first.");
        return new Response(
          JSON.stringify({ success: false, mode: "light", error: "No holdings/all cache available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      console.log(`[light] Using ${allEntries.length} entries from holdings/all cache`);

      const LIGHT_PERIODS = ["day", "week", "month", "year"] as const;
      const ALL_SORT_MODES = ["holdings", "followers", "likes", "subscribers", "sentTips", "receivedTips"] as const;

      for (const sortMode of ALL_SORT_MODES) {
        for (const period of LIGHT_PERIODS) {
          const result = await computeSnapshotDelta(supabase, allEntries, sortMode, period, sortMode === "holdings" ? rpcConfig : undefined);
          results.push(result);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`LIGHT refresh complete: ${successCount}/${results.length} successful`);

      return new Response(
        JSON.stringify({ success: true, mode: "light", message: `Light refresh: cached ${successCount}/${results.length} combinations`, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ================================================================
    // FULL MODE: API data + snapshots + all periods (NO RPC calls)
    // ================================================================
    console.log("Starting FULL leaderboard cache refresh (API-only, no RPC)...");

    // ────────────────────────────────────────────────────────────────
    // 1. HOLDINGS LEADERBOARD (using API-provided totals)
    // ────────────────────────────────────────────────────────────────
    try {
      console.log("Fetching holdings leaderboard from DeHub API...");

      const dehubData = (await fetchDeHubLeaderboard("holdings", "all")) as {
        result?: { byWalletBalance?: Array<Record<string, unknown>> };
      };

      const rawEntries = dehubData?.result?.byWalletBalance ?? [];
      console.log(`Got ${rawEntries.length} addresses from DeHub API`);

      const enriched: EnrichedEntry[] = rawEntries.map((entry) => {
        const apiTotal = (entry.total as number) ?? 0;
        return {
          account: (entry.account as string) || "",
          total: apiTotal,
          username: (entry.username as string) || undefined,
          userDisplayName: (entry.userDisplayName as string) || undefined,
          avatarUrl: (entry.avatarUrl as string) || undefined,
          sentTips: (entry.sentTips as number) ?? 0,
          receivedTips: (entry.receivedTips as number) ?? 0,
          followers: (entry.followers as number) ?? undefined,
          likes: (entry.likes as number) ?? undefined,
          subscribers: (entry.subscribers as number) ?? undefined,
          badgeBalance: apiTotal,
        };
      });

      // ── Inject or fix extra wallets (via account_info lookup) ─────
      const existingAccountsMap = new Map(enriched.map((e, i) => [e.account.toLowerCase(), i]));
      for (const [username, config] of Object.entries(EXTRA_WALLETS)) {
        const addr = config.wallet.toLowerCase();
        const existingIdx = existingAccountsMap.get(addr);
        const existingEntry = existingIdx !== undefined ? enriched[existingIdx] : null;
        
        // If wallet exists with a valid balance, skip
        if (existingEntry && existingEntry.total > 0) {
          continue;
        }
        
        // Fetch fresh data from account_info API
        try {
          const profile = await fetchDeHubUserProfile(config.wallet);
          // badgeBalance can be 0 even when the wallet has tokens (API bug)
          // Fall back to computing from balanceData (sum of walletBalance + staked)
          let balance = (profile?.badgeBalance as number) ?? 0;
          if (balance === 0 && Array.isArray(profile?.balanceData)) {
            for (const bd of profile.balanceData as Array<{ walletBalance?: number; staked?: number }>) {
              balance += (bd.walletBalance ?? 0) + (bd.staked ?? 0);
            }
          }
          
          const entry: EnrichedEntry = {
            account: addr,
            total: balance,
            username: (profile?.username as string) || username,
            userDisplayName: (profile?.userDisplayName as string) || (profile?.displayName as string) || config.displayName,
            avatarUrl: (profile?.avatarUrl as string) || (profile?.avatarImageUrl as string) || config.avatarUrl,
            sentTips: (profile?.sentTips as number) ?? 0,
            receivedTips: (profile?.receivedTips as number) ?? 0,
            followers: (profile?.followers as number) ?? undefined,
            likes: (profile?.likes as number) ?? undefined,
            subscribers: (profile?.subscribers as number) ?? undefined,
            badgeBalance: balance,
          };
          
          if (existingIdx !== undefined) {
            // Override existing zero-balance entry
            enriched[existingIdx] = entry;
            console.log(`Extra wallet ${username} (${addr}): overrode zero-balance entry with ${balance} DHB`);
          } else if (balance > 0) {
            enriched.push(entry);
            console.log(`Extra wallet ${username} (${addr}): added with ${balance} DHB`);
          } else {
            console.warn(`Extra wallet ${username} (${addr}): balance is 0 even from account_info`);
          }
        } catch (err) {
          console.error(`Failed to fetch extra wallet ${username}:`, err);
        }
      }

      enriched.sort((a, b) => b.total - a.total);

      // Deduplicate by lowercased address
      const seenAddrs = new Set<string>();
      const deduped = enriched.filter(e => {
        const addr = e.account.toLowerCase();
        if (seenAddrs.has(addr)) return false;
        seenAddrs.add(addr);
        return true;
      });

      const nonZero = deduped;
      const nonZeroPeriod = deduped.filter(e => !HOLDINGS_PERIOD_EXCLUDED.has(e.account.toLowerCase()));

      console.log(`Holdings: ${nonZero.length} total holders`);

      // ── Snapshot: upsert today's data ─────────────────────────────
      const today = new Date().toISOString().split("T")[0];

      const { count: snapshotCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", today);

      if (!snapshotCount || snapshotCount === 0) {
        console.log(`Creating daily snapshot for ${today}...`);
        const snapshotRows = nonZero.map((e) => ({
          account: e.account.toLowerCase(),
          balance: e.total,
          followers: e.followers ?? 0,
          likes: e.likes ?? 0,
          subscribers: e.subscribers ?? 0,
          sent_tips: e.sentTips,
          received_tips: e.receivedTips,
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
      const allTimeData = { result: { byWalletBalance: nonZero } };

      const { error: allErr } = await supabase.from("leaderboard_cache").upsert(
        { sort_mode: "holdings", period: "all", data: allTimeData, updated_at: new Date().toISOString() },
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
        const result = await computeSnapshotDelta(supabase, nonZeroPeriod, "holdings", period, rpcConfig);
        results.push(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Error building holdings leaderboard:", msg);
      PERIODS.forEach((period) =>
        results.push({ sort: "holdings", period, success: false, error: msg })
      );
    }

    // ────────────────────────────────────────────────────────────────
    // 2. SOCIAL METRICS (followers, likes, subscribers)
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
        const sortedAll = [...allEntries].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));

        const allData = { result: { byWalletBalance: sortedAll } };

        const { error: allMetricErr } = await supabase.from("leaderboard_cache").upsert(
          { sort_mode: metric, period: "all", data: allData, updated_at: new Date().toISOString() },
          { onConflict: "sort_mode,period" }
        );

        if (allMetricErr) {
          console.error(`Error caching ${metric}/all:`, allMetricErr);
          results.push({ sort: metric, period: "all", success: false, error: allMetricErr.message });
        } else {
          console.log(`${metric}/all: ${sortedAll.length} entries`);
          results.push({ sort: metric, period: "all", success: true });
        }

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
    // 3. TIP CATEGORIES (sentTips, receivedTips) - API + snapshot deltas
    // ────────────────────────────────────────────────────────────────
    try {
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
    console.log(`FULL leaderboard cache refresh complete: ${successCount}/${results.length} successful`);

    return new Response(
      JSON.stringify({
        success: true,
        mode: "full",
        message: `Full refresh: cached ${successCount}/${results.length} leaderboard combinations`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error refreshing leaderboard cache:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
