import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Contract addresses ──────────────────────────────────────────────
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";
const BALANCE_OF_SELECTOR = "0x70a08231";

// ── DeHub API (for address list + profile data) ─────────────────────
const DEHUB_API_BASE = "https://api.dehub.io";

// Non-holdings categories still fetched from DeHub API
const API_SORT_MODES = ["sentTips", "receivedTips"] as const;
const PERIODS = ["day", "week", "month", "year", "all"] as const;

// ── Helpers ─────────────────────────────────────────────────────────

function encodeBalanceOf(address: string): string {
  const cleaned = address.replace("0x", "").toLowerCase().padStart(64, "0");
  return BALANCE_OF_SELECTOR + cleaned;
}

function hexToNumber(hex: string): number {
  if (!hex || hex === "0x" || hex === "0x0") return 0;
  try {
    return Number(BigInt(hex)) / 1e18;
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
  return json.result || "0x0";
}

/** Get on-chain DHB total for a single address (Base holdings + BNB holdings + staking on both chains) */
async function getOnChainBalance(
  address: string,
  baseRpc: string,
  bnbRpc: string
): Promise<number> {
  const callData = encodeBalanceOf(address);

  const [baseHoldings, bnbHoldings, baseStaked, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, callData),
    rpcCall(bnbRpc, DHB_BNB, callData),
    rpcCall(baseRpc, STAKING_CONTRACT, callData),
    rpcCall(bnbRpc, STAKING_CONTRACT, callData),
  ]);

  return (
    hexToNumber(baseHoldings) +
    hexToNumber(bnbHoldings) +
    hexToNumber(baseStaked) +
    hexToNumber(bnbStaked)
  );
}

/** Fetch the DeHub leaderboard for a given sort/period (used for non-holdings categories and to seed the address list) */
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
    //    - Pull the address list + profile data from DeHub API
    //    - Re-query on-chain balances for every address
    //    - Re-sort by on-chain total
    // ────────────────────────────────────────────────────────────────
    try {
      console.log("Fetching holdings leaderboard (on-chain)...");

      // Get address list & profile data from DeHub (all-time holdings)
      const dehubData = (await fetchDeHubLeaderboard(
        "holdings",
        "all"
      )) as {
        result?: { byWalletBalance?: Array<Record<string, unknown>> };
      };

      const rawEntries = dehubData?.result?.byWalletBalance ?? [];
      console.log(`Got ${rawEntries.length} addresses from DeHub`);

      // Batch-query on-chain balances (10 at a time to avoid RPC overload)
      const BATCH_SIZE = 10;
      const enriched: Array<{
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
      }> = [];

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
          });
        });

        if (i + BATCH_SIZE < rawEntries.length) {
          // Small delay between batches to avoid rate limiting
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Sort by on-chain total descending
      enriched.sort((a, b) => b.total - a.total);

      // Filter out zero-balance entries
      const nonZero = enriched.filter((e) => e.total > 0);

      console.log(
        `On-chain holdings: ${nonZero.length} holders with balance > 0`
      );

      // Build response in the same format the frontend expects
      const holdingsData = {
        result: { byWalletBalance: nonZero },
      };

      // Cache for all periods (holdings don't change by period — it's a live on-chain snapshot)
      for (const period of PERIODS) {
        const { error } = await supabase.from("leaderboard_cache").upsert(
          {
            sort_mode: "holdings",
            period,
            data: holdingsData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sort_mode,period" }
        );

        if (error) {
          console.error(`Error caching holdings/${period}:`, error);
          results.push({
            sort: "holdings",
            period,
            success: false,
            error: error.message,
          });
        } else {
          results.push({ sort: "holdings", period, success: true });
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
    //    Still sourced from DeHub API
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
