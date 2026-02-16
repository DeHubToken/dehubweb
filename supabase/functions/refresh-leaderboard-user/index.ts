import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Contract addresses
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

const DEHUB_API_BASE = "https://api.dehub.io";
const DISCOVERY_MIN_BALANCE = 10_000;

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

async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = await res.json();
  return json.result || "0x0";
}

async function bnbRpcCall(alchemyBnbRpc: string, to: string, data: string): Promise<string> {
  const result = await rpcCall(alchemyBnbRpc, to, data);
  if (result && result !== "0x0" && result !== "0x") return result;
  for (const rpc of BNB_PUBLIC_RPCS) {
    try {
      const fallback = await rpcCall(rpc, to, data);
      if (fallback && fallback !== "0x0" && fallback !== "0x") return fallback;
    } catch { continue; }
  }
  return result;
}

async function getOnChainBalance(address: string, baseRpc: string, bnbRpc: string): Promise<number> {
  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);

  const [baseHoldings, bnbHoldings, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData),
  ]);

  return hexToNumber(baseHoldings) + hexToNumber(bnbHoldings) + hexFirstSlotToNumber(bnbStaked);
}

interface LeaderboardEntry {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const address = url.searchParams.get("address")?.toLowerCase();

    if (!address || !address.startsWith("0x") || address.length !== 42) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid wallet address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ success: false, error: "RPC not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    console.log(`[refresh-user] Checking balance for ${address}`);

    // 1. Get on-chain balance
    const balance = await getOnChainBalance(address, baseRpc, bnbRpc);
    console.log(`[refresh-user] Balance: ${balance.toFixed(2)} DHB`);

    if (balance < DISCOVERY_MIN_BALANCE) {
      return new Response(
        JSON.stringify({ success: true, balance, added: false, reason: "Balance below minimum (10,000 DHB)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch profile from DeHub API
    let profile: Record<string, unknown> = {};
    try {
      const profileRes = await fetch(
        `${DEHUB_API_BASE}/api/account_info/${address}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const raw = profileData?.result || profileData || {};
        // The API may nest profile data under an 'account' object
        profile = (raw.account || raw) as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("[refresh-user] Profile fetch failed:", err);
    }

    // 3. Build the entry
    const newEntry: LeaderboardEntry = {
      account: address,
      total: balance,
      username: (profile.username as string) || (profile.handle as string) || undefined,
      userDisplayName: (profile.userDisplayName as string) || (profile.displayName as string) || (profile.display_name as string) || undefined,
      avatarUrl: (profile.avatarUrl as string) || (profile.avatar as string) || undefined,
      followers: (profile.followers as number) ?? (profile.followerCount as number) ?? undefined,
      likes: (profile.likes as number) ?? (profile.likeCount as number) ?? undefined,
      subscribers: (profile.subscribers as number) ?? undefined,
      sentTips: (profile.sentTips as number) ?? 0,
      receivedTips: (profile.receivedTips as number) ?? 0,
      badgeBalance: balance,
    };

    console.log(`[refresh-user] Profile resolved: username=${newEntry.username}, displayName=${newEntry.userDisplayName}`);

    // 4. Read current leaderboard cache for holdings/all
    const { data: cached, error: cacheError } = await supabase
      .from("leaderboard_cache")
      .select("id, data")
      .eq("sort_mode", "holdings")
      .eq("period", "all")
      .single();

    if (cacheError || !cached) {
      console.error("[refresh-user] Cache read failed:", cacheError);
      return new Response(
        JSON.stringify({ success: false, error: "Leaderboard cache not available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Merge user into cached data
    const cacheData = cached.data as { result?: { byWalletBalance?: LeaderboardEntry[] } };
    const entries: LeaderboardEntry[] = cacheData?.result?.byWalletBalance || [];

    // Remove existing entry for this address (if any) and add the new one
    const filtered = entries.filter(e => e.account.toLowerCase() !== address);
    filtered.push(newEntry);

    // Sort by total descending
    filtered.sort((a, b) => b.total - a.total);

    const updatedData = {
      ...cacheData,
      result: { ...cacheData.result, byWalletBalance: filtered },
    };

    // 6. Write back to cache
    const { error: updateError } = await supabase
      .from("leaderboard_cache")
      .update({ data: updatedData, updated_at: new Date().toISOString() })
      .eq("id", cached.id);

    if (updateError) {
      console.error("[refresh-user] Cache update failed:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update cache" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[refresh-user] Successfully merged ${address} with ${balance.toFixed(2)} DHB`);

    return new Response(
      JSON.stringify({ success: true, balance, added: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[refresh-user] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
