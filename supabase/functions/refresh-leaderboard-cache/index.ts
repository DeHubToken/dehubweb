import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Contract addresses ──────────────────────────────────────────────
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113caf77b61b510f332d5ef4cf5b41a761d";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6"; // BNB only

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

// Period to days-ago mapping for snapshot deltas
const PERIOD_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

// ── Helpers ─────────────────────────────────────────────────────────

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

async function rpcCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) {
    console.error(
      `[rpc-error] to=${to} data=${data.slice(0, 10)} error=`,
      json.error
    );
  }
  return json.result || "0x0";
}

/** Call BNB with fallback to public RPCs if Alchemy returns empty */
async function bnbRpcCall(
  alchemyBnbRpc: string,
  to: string,
  data: string
): Promise<string> {
  const result = await rpcCall(alchemyBnbRpc, to, data);
  if (result && result !== "0x0" && result !== "0x") {
    return result;
  }

  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallbackResult = await rpcCall(rpc, to, data);
      if (fallbackResult && fallbackResult !== "0x0" && fallbackResult !== "0x") {
        return fallbackResult;
      }
    } catch {
      continue;
    }
  }

  return result;
}

/** Get on-chain DHB total for a single address */
async function getOnChainBalance(
  address: string,
  baseRpc: string,
  bnbRpc: string
): Promise<number> {
  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);

  const [baseHoldings, bnbHoldings, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData),
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
}

// ── Extra wallets to include (username -> wallet address) ───────────
// These wallets are queried on-chain and injected into the holdings leaderboard
const EXTRA_WALLETS: Record<string, { wallet: string; displayName?: string; avatarUrl?: string }> = {
  maldoteth: { wallet: "0xbb0265021e03a048a6e8dcf249cd5067f35db45d", displayName: "mal", avatarUrl: "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0x9324840523a5d17dd12a2f11a9472e5a199c1937.jpg" },
};

// ── Main handler ────────────────────────────────────────────────────

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
      console.error("ALCHEMY_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "ALCHEMY_API_KEY missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    console.log("Starting leaderboard cache refresh...");

    const results: {
      sort: string;
      period: string;
      success: boolean;
      error?: string;
    }[] = [];

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

      const BATCH_SIZE = 10;
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
          enriched.push({
            account: (entry.account as string) || "",
            total: balances[idx],
            username: (entry.username as string) || undefined,
            userDisplayName: (entry.userDisplayName as string) || undefined,
            avatarUrl: (entry.avatarUrl as string) || undefined,
            sentTips: (entry.sentTips as number) ?? 0,
            receivedTips: (entry.receivedTips as number) ?? 0,
            followers: (entry.followers as number) ?? undefined,
            likes: (entry.likes as number) ?? undefined,
            subscribers: (entry.subscribers as number) ?? undefined,
            badgeBalance: (entry.badgeBalance as number) ?? undefined,
          });
        });

        if (i + BATCH_SIZE < rawEntries.length) {
          await new Promise((r) => setTimeout(r, 200));
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
              });
              console.log(`Extra wallet ${username} (${config.wallet}): ${balance}`);
            }
          } catch (err) {
            console.error(`Failed to query extra wallet ${username}:`, err);
          }
        }
      }

      enriched.sort((a, b) => b.total - a.total);
      const nonZero = enriched.filter((e) => e.total > 0);

      console.log(
        `On-chain holdings: ${nonZero.length} holders with balance > 0`
      );

      // ── Snapshot: upsert today's balances (once per day) ──────────
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      // Check if today's snapshot already exists
      const { count: snapshotCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", today);

      if (!snapshotCount || snapshotCount === 0) {
        console.log(`Creating daily snapshot for ${today}...`);
        const snapshotRows = nonZero.map((e) => ({
          account: e.account.toLowerCase(),
          balance: e.total,
          snapshot_date: today,
        }));

        // Upsert in batches of 100
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

        // Cleanup old snapshots
        try {
          await supabase.rpc("cleanup_old_leaderboard_snapshots");
          console.log("Old snapshots cleaned up");
        } catch (cleanupErr) {
          console.error("Snapshot cleanup error:", cleanupErr);
        }
      } else {
        console.log(`Snapshot for ${today} already exists, skipping`);
      }

      // ── Cache "all" period (sorted by total balance, no change) ───
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

      // ── Cache time-based periods (sorted by delta) ────────────────
      for (const period of ["day", "week", "month", "year"] as const) {
        try {
          const daysAgo = PERIOD_DAYS[period];
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - daysAgo);
          const pastDateStr = pastDate.toISOString().split("T")[0];

          // Fetch historical snapshots for comparison
          const { data: snapshots, error: snapFetchErr } = await supabase
            .from("leaderboard_snapshots")
            .select("account, balance")
            .eq("snapshot_date", pastDateStr);

          if (snapFetchErr) {
            console.error(`Error fetching snapshots for ${period}:`, snapFetchErr);
          }

          // Build lookup map: account -> past balance
          const pastBalanceMap = new Map<string, number>();
          if (snapshots) {
            for (const snap of snapshots) {
              pastBalanceMap.set(snap.account.toLowerCase(), snap.balance);
            }
          }

          // Compute deltas
          const withDeltas: EnrichedEntry[] = nonZero.map((entry) => {
            const pastBalance = pastBalanceMap.get(entry.account.toLowerCase());
            const delta = pastBalance !== undefined
              ? entry.total - pastBalance
              : 0; // No historical data = 0 delta (not new to leaderboard)
            return { ...entry, delta };
          });

          // Sort by delta descending, filter to positive deltas only
          const sorted = withDeltas
            .filter((e) => e.delta !== undefined && e.delta > 0)
            .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

          const periodData = {
            result: { byWalletBalance: sorted },
            hasHistoricalData: pastBalanceMap.size > 0,
          };

          const { error } = await supabase.from("leaderboard_cache").upsert(
            {
              sort_mode: "holdings",
              period,
              data: periodData,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "sort_mode,period" }
          );

          if (error) {
            console.error(`Error caching holdings/${period}:`, error);
            results.push({ sort: "holdings", period, success: false, error: error.message });
          } else {
            console.log(`holdings/${period}: ${sorted.length} entries with positive delta (${pastBalanceMap.size} historical snapshots)`);
            results.push({ sort: "holdings", period, success: true });
          }
        } catch (periodErr) {
          const msg = periodErr instanceof Error ? periodErr.message : "Unknown error";
          console.error(`Error computing holdings/${period}:`, msg);
          results.push({ sort: "holdings", period, success: false, error: msg });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Error building on-chain holdings leaderboard:", msg);
      PERIODS.forEach((period) =>
        results.push({ sort: "holdings", period, success: false, error: msg })
      );
    }

    // ────────────────────────────────────────────────────────────────
    // 2. API-BASED CATEGORIES (sentTips, receivedTips)
    // ────────────────────────────────────────────────────────────────
    for (const sort of API_SORT_MODES) {
      for (const period of PERIODS) {
        try {
          console.log(`Fetching ${sort}/${period} from API...`);
          const data = await fetchDeHubLeaderboard(sort, period);

          const { error } = await supabase.from("leaderboard_cache").upsert(
            {
              sort_mode: sort,
              period,
              data,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "sort_mode,period" }
          );

          if (error) {
            console.error(`Error caching ${sort}/${period}:`, error);
            results.push({
              sort,
              period,
              success: false,
              error: error.message,
            });
          } else {
            results.push({ sort, period, success: true });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error fetching ${sort}/${period}:`, msg);
          results.push({ sort, period, success: false, error: msg });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `Leaderboard cache refresh complete: ${successCount}/${results.length} successful`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cached ${successCount}/${results.length} leaderboard combinations`,
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
