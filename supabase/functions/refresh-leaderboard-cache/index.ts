import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const response = await fetch(
      `${DEHUB_API_BASE}/api/user?account=${account}`,
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

    const MIN_SNAPSHOT_ENTRIES = 10;
    const MIN_NONZERO_RATIO = 0.3;
    const { data: candidateSnaps } = await supabase
      .from("leaderboard_snapshots")
      .select("snapshot_date")
      .lte("snapshot_date", pastDateStr)
      .order("snapshot_date", { ascending: false })
      .limit(10);

    let qualityField: string;
    if (sortMode === "holdings") qualityField = "balance";
    else if (sortMode === "sentTips") qualityField = "sent_tips";
    else if (sortMode === "receivedTips") qualityField = "received_tips";
    else qualityField = sortMode;

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

    const getEntryValue = (entry: EnrichedEntry): number => {
      if (sortMode === "holdings") return entry.total;
      if (sortMode === "sentTips") return entry.sentTips;
      if (sortMode === "receivedTips") return entry.receivedTips;
      return (entry as any)[sortMode] ?? 0;
    };

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

    const requireRealPast = (period === "day" || period === "week") &&
      ["followers", "likes", "subscribers"].includes(sortMode);

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
    console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries with positive delta`);
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: { sort: string; period: string; success: boolean; error?: string }[] = [];

    // ================================================================
    // LIGHT MODE: Only recompute period caches using existing snapshots
    // No API calls. Pure DB reads + cache writes.
    // ================================================================
    if (mode === "light") {
      console.log("Starting LIGHT leaderboard cache refresh (snapshot-based)...");

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
          const result = await computeSnapshotDelta(supabase, allEntries, sortMode, period);
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

      // ── Inject extra wallets (via API profile lookup) ─────────────
      const existingAccounts = new Set(enriched.map(e => e.account.toLowerCase()));
      for (const [username, config] of Object.entries(EXTRA_WALLETS)) {
        if (!existingAccounts.has(config.wallet.toLowerCase())) {
          try {
            const profile = await fetchDeHubUserProfile(config.wallet);
            const balance = (profile?.total as number) ?? 0;
            if (balance > 0) {
              enriched.push({
                account: config.wallet.toLowerCase(),
                total: balance,
                username: (profile?.username as string) || username,
                userDisplayName: (profile?.userDisplayName as string) || config.displayName,
                avatarUrl: (profile?.avatarUrl as string) || config.avatarUrl,
                sentTips: (profile?.sentTips as number) ?? 0,
                receivedTips: (profile?.receivedTips as number) ?? 0,
                followers: (profile?.followers as number) ?? undefined,
                likes: (profile?.likes as number) ?? undefined,
                subscribers: (profile?.subscribers as number) ?? undefined,
                badgeBalance: balance,
              });
              console.log(`Extra wallet ${username} (${config.wallet}): ${balance} DHB`);
            }
          } catch (err) {
            console.error(`Failed to fetch extra wallet ${username}:`, err);
          }
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
        const result = await computeSnapshotDelta(supabase, nonZeroPeriod, "holdings", period);
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
