// refresh-leaderboard-user
// ========================
// Lets a signed-in wallet push its current on-chain DHB balance into the
// cached holdings/all board without waiting for the nightly refresh.
//
// The wallet is the one the DeHub token verifies to — the address query
// param this used to accept let anyone rewrite anyone's row.

import {
  checkRateLimit,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

// Contract addresses
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D";
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

/** One self-refresh per wallet per ten minutes. */
const REFRESH_LIMIT = { limit: 1, windowMs: 10 * 60 * 1000 };
const WRITE_ATTEMPTS = 3;

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

/** eth_call at latest. Throws on transport / JSON-RPC failure; "0x0" is a real zero. */
async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(`RPC error: ${json.error?.message ?? json.error}`);
  if (typeof json?.result !== "string") throw new Error("RPC: empty response");
  return json.result;
}

async function bnbRpcCall(alchemyBnbRpc: string, to: string, data: string): Promise<string> {
  try {
    return await rpcCall(alchemyBnbRpc, to, data);
  } catch (alchemyErr) {
    let lastErr: unknown = alchemyErr;
    for (const rpc of BNB_PUBLIC_RPCS) {
      try {
        return await rpcCall(rpc, to, data);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
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
  total: number | null;
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
  refreshedAt?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const address = auth.wallet;

    const supabase = serviceClient();

    const rl = await checkRateLimit(supabase, address, "leaderboard-self-refresh", REFRESH_LIMIT);
    if (!rl.allowed) {
      return jsonResponse(
        { success: false, error: `You can refresh once every 10 minutes. Try again after ${rl.resetAt.toISOString()}.` },
        429,
      );
    }

    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    if (!alchemyKey) {
      return jsonResponse({ success: false, error: "RPC not configured" }, 500);
    }

    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const bnbRpc = `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    console.log(`[refresh-user] Checking balance for ${address}`);

    // 1. Get on-chain balance
    let balance: number;
    try {
      balance = await getOnChainBalance(address, baseRpc, bnbRpc);
    } catch (err) {
      console.error("[refresh-user] Balance lookup failed:", err);
      return jsonResponse({ success: false, error: "Could not read the on-chain balance right now. Try again shortly." }, 502);
    }
    console.log(`[refresh-user] Balance: ${balance.toFixed(2)} DHB`);

    if (balance < DISCOVERY_MIN_BALANCE) {
      return jsonResponse({ success: true, balance, added: false, reason: "Balance below minimum (10,000 DHB)" });
    }

    // 2. Fetch profile from DeHub API
    let profile: Record<string, unknown> = {};
    try {
      const profileRes = await fetch(
        `${DEHUB_API_BASE}/api/account_info/${address}`,
        { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) },
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
      refreshedAt: new Date().toISOString(),
    };

    console.log(`[refresh-user] Profile resolved: username=${newEntry.username}, displayName=${newEntry.userDisplayName}`);

    // 4. Merge into holdings/all. The cache row is one JSON blob that the
    // nightly refresh and every self-refresh rewrite whole, so the write is
    // conditioned on the updated_at that was read; a concurrent writer makes
    // it match zero rows and the merge is redone on fresh data.
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      const { data: cached, error: cacheError } = await supabase
        .from("leaderboard_cache")
        .select("id, data, updated_at")
        .eq("sort_mode", "holdings")
        .eq("period", "all")
        .maybeSingle();

      if (cacheError || !cached) {
        console.error("[refresh-user] Cache read failed:", cacheError);
        return jsonResponse({ success: false, error: "Leaderboard cache not available" }, 500);
      }

      const cacheData = cached.data as { result?: { byWalletBalance?: LeaderboardEntry[] } };
      const entries: LeaderboardEntry[] = cacheData?.result?.byWalletBalance || [];

      const filtered = entries.filter((e) => e.account.toLowerCase() !== address);
      filtered.push(newEntry);
      filtered.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));

      const updatedData = {
        ...cacheData,
        result: { ...cacheData.result, byWalletBalance: filtered },
      };

      const { data: written, error: updateError } = await supabase
        .from("leaderboard_cache")
        .update({ data: updatedData, updated_at: new Date().toISOString() })
        .eq("id", cached.id)
        .eq("updated_at", cached.updated_at)
        .select("id");

      if (updateError) {
        console.error("[refresh-user] Cache update failed:", updateError);
        return jsonResponse({ success: false, error: "Failed to update cache" }, 500);
      }
      if (written && written.length > 0) {
        console.log(`[refresh-user] Merged ${address} with ${balance.toFixed(2)} DHB (attempt ${attempt})`);
        return jsonResponse({ success: true, balance, added: true });
      }
      console.warn(`[refresh-user] Cache changed underneath attempt ${attempt}; retrying`);
    }

    return jsonResponse({ success: false, error: "Leaderboard is being refreshed. Try again in a moment." }, 409);
  } catch (err) {
    console.error("[refresh-user] Error:", err);
    return jsonResponse({ success: false, error: "Internal error" }, 500);
  }
});
