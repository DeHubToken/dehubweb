import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
};

// ── On-chain balance helpers (Alchemy RPC) ──────────────────────────
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D";
const STAKING_CONTRACT = "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6";
const BALANCE_OF_SELECTOR = "0x70a08231";
const USER_INFOS_SELECTOR = "0x43b0215f";
// Public nodes only serve recent state. Asking them for a historical block
// returns "missing trie node", so they are a fallback for "latest" alone.
const BNB_PUBLIC_RPCS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

/** Addresses fetched in parallel per batch (three RPC calls each). */
const BATCH = 25;

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

/**
 * One JSON-RPC request. Throws on transport failure, non-2xx, or a JSON-RPC
 * error object. A successful call may legitimately return "0x" / "0x0" — that
 * is a real zero, never a failure signal.
 */
async function rpcRequest(rpcUrl: string, method: string, params: unknown[]): Promise<string | Record<string, unknown> | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) {
    const msg = typeof json.error === "object" ? json.error.message : String(json.error);
    throw new Error(`RPC ${method} error: ${msg}`);
  }
  if (json?.result === undefined) throw new Error(`RPC ${method}: empty response`);
  return json.result;
}

async function rpcCall(rpcUrl: string, to: string, data: string, blockTag = "latest"): Promise<string> {
  const result = await rpcRequest(rpcUrl, "eth_call", [{ to, data }, blockTag]);
  return typeof result === "string" ? result : "0x";
}

async function bnbRpcCall(alchemyBnbRpc: string, to: string, data: string, blockTag = "latest"): Promise<string> {
  try {
    return await rpcCall(alchemyBnbRpc, to, data, blockTag);
  } catch (alchemyErr) {
    if (blockTag !== "latest") throw alchemyErr;
    let lastErr: unknown = alchemyErr;
    for (const rpc of BNB_PUBLIC_RPCS) {
      try {
        return await rpcCall(rpc, to, data, blockTag);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}

/** Raw on-chain DHB (Base + BNB wallet + legacy BNB staking) at the given blocks. */
async function getOnChainBalanceAtBlock(address: string, baseRpc: string, bnbRpc: string, baseBlock: string, bnbBlock: string): Promise<number> {
  const holdingsData = encodeCall(BALANCE_OF_SELECTOR, address);
  const stakingData = encodeCall(USER_INFOS_SELECTOR, address);
  const [baseHoldings, bnbHoldings, bnbStaked] = await Promise.all([
    rpcCall(baseRpc, DHB_BASE, holdingsData, baseBlock),
    bnbRpcCall(bnbRpc, DHB_BNB, holdingsData, bnbBlock),
    bnbRpcCall(bnbRpc, STAKING_CONTRACT, stakingData, bnbBlock),
  ]);
  return hexToNumber(baseHoldings) + hexToNumber(bnbHoldings) + hexFirstSlotToNumber(bnbStaked);
}

/**
 * Balances for many addresses. An address whose lookup failed is simply absent
 * from the map — never recorded as 0, because a zero here would later read as
 * "sold everything" on the period boards.
 */
async function batchOnChainBalancesAtBlock(
  addresses: string[],
  baseRpc: string,
  bnbRpc: string,
  baseBlock: string,
  bnbBlock: string,
  label: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  let failures = 0;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map((addr) => getOnChainBalanceAtBlock(addr, baseRpc, bnbRpc, baseBlock, bnbBlock)),
    );
    settled.forEach((s, idx) => {
      if (s.status === "fulfilled") result.set(batch[idx].toLowerCase(), s.value);
      else failures++;
    });
  }
  if (failures > 0) {
    console.warn(`[rpc] ${label}: ${failures}/${addresses.length} address lookups failed (left absent)`);
  }
  return result;
}

// ── Per-invocation memo ─────────────────────────────────────────────
// Every period of a run needs the same "now" — the latest balances, the
// current pool stake, the chain heads. Fetch each once and share it.

interface BlockRef { number: number; timestamp: number }

interface RunContext {
  latestBalances: Map<string, number>;
  latestAttempted: Set<string>;
  currentStaked?: Promise<Map<string, number>>;
  chainHead: Map<string, Promise<BlockRef>>;
  blockAtTs: Map<string, Promise<number>>;
}

function newRunContext(): RunContext {
  return {
    latestBalances: new Map(),
    latestAttempted: new Set(),
    chainHead: new Map(),
    blockAtTs: new Map(),
  };
}

/** Latest on-chain balances, fetched at most once per address per run. */
async function getLatestBalances(ctx: RunContext, addresses: string[], rpc: { baseRpc: string; bnbRpc: string }): Promise<Map<string, number>> {
  const missing = addresses.map((a) => a.toLowerCase()).filter((a) => !ctx.latestAttempted.has(a));
  if (missing.length > 0) {
    missing.forEach((a) => ctx.latestAttempted.add(a));
    const fetched = await batchOnChainBalancesAtBlock(missing, rpc.baseRpc, rpc.bnbRpc, "latest", "latest", "latest");
    for (const [addr, val] of fetched) ctx.latestBalances.set(addr, val);
    console.log(`[rpc] latest balances: fetched ${fetched.size}/${missing.length} new, ${ctx.latestBalances.size} cached this run`);
  }
  const out = new Map<string, number>();
  for (const a of addresses) {
    const v = ctx.latestBalances.get(a.toLowerCase());
    if (v !== undefined) out.set(a.toLowerCase(), v);
  }
  return out;
}

function getCurrentStaked(ctx: RunContext, supabase: any): Promise<Map<string, number>> {
  if (!ctx.currentStaked) ctx.currentStaked = fetchNetStakedMap(supabase);
  return ctx.currentStaked;
}

// ── Historical block lookup ─────────────────────────────────────────

async function getBlock(rpcUrl: string, tag: string | number): Promise<BlockRef> {
  const param = typeof tag === "number" ? "0x" + tag.toString(16) : tag;
  const block = await rpcRequest(rpcUrl, "eth_getBlockByNumber", [param, false]);
  if (!block || typeof block !== "object") throw new Error(`eth_getBlockByNumber(${param}) returned nothing`);
  return {
    number: Number(BigInt(block.number as string)),
    timestamp: Number(BigInt(block.timestamp as string)),
  };
}

function getChainHead(ctx: RunContext, chain: string, rpcUrl: string): Promise<BlockRef> {
  let p = ctx.chainHead.get(chain);
  if (!p) {
    p = getBlock(rpcUrl, "latest");
    ctx.chainHead.set(chain, p);
  }
  return p;
}

/**
 * The last block mined at or before `targetTs` (unix seconds), by binary
 * search on block timestamps. Block times drift (BNB halved its block time in
 * 2025), so a fixed blocks-per-day guess landed month and year boards days
 * off their window. Costs ~25 calls per chain per period; cached per run.
 */
function findBlockAtTimestamp(ctx: RunContext, chain: string, rpcUrl: string, targetTs: number, guessSecondsPerBlock: number): Promise<number> {
  const key = `${chain}:${targetTs}`;
  let p = ctx.blockAtTs.get(key);
  if (!p) {
    p = (async () => {
      const head = await getChainHead(ctx, chain, rpcUrl);
      if (targetTs >= head.timestamp) return head.number;

      let hi = head;
      let span = Math.ceil(((head.timestamp - targetTs) / guessSecondsPerBlock) * 1.5);
      let lo = await getBlock(rpcUrl, Math.max(0, head.number - span));
      // Widen until the low bracket is on the far side of the target.
      let widen = 0;
      while (lo.timestamp > targetTs && lo.number > 0 && widen < 8) {
        span *= 2;
        lo = await getBlock(rpcUrl, Math.max(0, head.number - span));
        widen++;
      }
      if (lo.timestamp > targetTs) return 0;

      while (hi.number - lo.number > 1) {
        const midNum = Math.floor((lo.number + hi.number) / 2);
        const mid = await getBlock(rpcUrl, midNum);
        if (mid.timestamp <= targetTs) lo = mid;
        else hi = mid;
      }
      return lo.number;
    })();
    ctx.blockAtTs.set(key, p);
  }
  return p;
}

/** Base + BNB block tags for a moment in time, as hex strings for eth_call. */
async function historicalBlockTags(ctx: RunContext, rpc: { baseRpc: string; bnbRpc: string }, at: Date): Promise<{ base: string; bnb: string; baseNum: number; bnbNum: number }> {
  const ts = Math.floor(at.getTime() / 1000);
  const [baseNum, bnbNum] = await Promise.all([
    findBlockAtTimestamp(ctx, "base", rpc.baseRpc, ts, 2),
    findBlockAtTimestamp(ctx, "bnb", rpc.bnbRpc, ts, 1),
  ]);
  return { base: "0x" + baseNum.toString(16), bnb: "0x" + bnbNum.toString(16), baseNum, bnbNum };
}

// ── Paginated reads ─────────────────────────────────────────────────
// PostgREST silently caps a select at 1000 rows. Anything that reads a whole
// snapshot day or the staking ledger has to page.

const PAGE = 1000;

async function fetchAllRows<T>(build: (from: number, to: number) => any, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      console.warn(`[db] ${label}: page at ${from} failed:`, error.message ?? error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Net stake per wallet in the transfer-based pool, from staking_records.
 * Records are inserted only after a real Transfer event is verified.
 * @param beforeDate - include only records created at or before this ISO date
 */
async function fetchNetStakedMap(supabase: any, beforeDate?: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rows = await fetchAllRows<{ wallet_address: string; amount: number | string; action: string }>(
    (from, to) => {
      let q = supabase.from("staking_records").select("wallet_address, amount, action").order("id", { ascending: true });
      if (beforeDate) q = q.lte("created_at", beforeDate);
      return q.range(from, to);
    },
    `staking_records${beforeDate ? ` <= ${beforeDate}` : ""}`,
  );
  for (const record of rows) {
    const addr = (record.wallet_address as string).toLowerCase();
    const amount = Number(record.amount) || 0;
    const current = map.get(addr) || 0;
    if (record.action === "stake") map.set(addr, current + amount);
    else if (record.action === "unstake") map.set(addr, current - amount);
  }
  for (const [addr, val] of map) {
    if (val <= 0) map.delete(addr);
  }
  console.log(`[staking] Net staked map: ${map.size} wallets with positive stake${beforeDate ? ` (before ${beforeDate})` : ""}`);
  return map;
}

async function fetchSnapshotDay(supabase: any, date: string, field: string): Promise<Map<string, number>> {
  const rows = await fetchAllRows<Record<string, unknown>>(
    (from, to) => supabase
      .from("leaderboard_snapshots")
      .select(`account, ${field}`)
      .eq("snapshot_date", date)
      .order("account", { ascending: true })
      .range(from, to),
    `snapshot ${date}/${field}`,
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.account).toLowerCase(), Number(row[field] ?? 0));
  }
  return map;
}

// ── DeHub API ───────────────────────────────────────────────────────
const DEHUB_API_BASE = "https://api.dehub.io";
const ALL_SORT_MODES = ["holdings", "sentTips", "receivedTips", "followers", "likes", "subscribers"] as const;
type SortMode = typeof ALL_SORT_MODES[number];
const SOCIAL_METRICS = ["followers", "likes", "subscribers"] as const;
const DELTA_PERIODS = ["day", "week", "month", "year"] as const;

const PERIOD_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

// ── Enriched entry type ─────────────────────────────────────────────
interface EnrichedEntry {
  account: string;
  /** null when the account hides its balance (hideBadgeAndBalance) */
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
  hideBadgeAndBalance?: boolean;
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

// ── DeHub API helpers ───────────────────────────────────────────────

async function fetchDeHubLeaderboard(sort: string, period: string): Promise<unknown> {
  const params = new URLSearchParams({ sort });
  if (period !== "all") params.set("period", period);
  const response = await fetch(
    `${DEHUB_API_BASE}/api/leaderboard?${params.toString()}`,
    { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`DeHub leaderboard fetch failed: ${response.status}`);
  return response.json();
}

function toEnriched(entry: Record<string, unknown>): EnrichedEntry {
  const hidden = entry.hideBadgeAndBalance === true;
  const rawTotal = entry.total;
  const total = typeof rawTotal === "number" ? rawTotal : (hidden ? null : Number(rawTotal ?? 0) || 0);
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  return {
    account: (entry.account as string) || "",
    total,
    username: (entry.username as string) || undefined,
    userDisplayName: (entry.userDisplayName as string) || undefined,
    avatarUrl: (entry.avatarUrl as string) || undefined,
    sentTips: num(entry.sentTips) ?? 0,
    receivedTips: num(entry.receivedTips) ?? 0,
    followers: num(entry.followers),
    likes: num(entry.likes),
    subscribers: num(entry.subscribers),
    badgeBalance: total ?? undefined,
    ...(hidden ? { hideBadgeAndBalance: true } : {}),
  };
}

/** One 'all' board from the API, normalised, deduped by address. */
async function fetchAllBoard(sort: SortMode): Promise<EnrichedEntry[]> {
  const data = (await fetchDeHubLeaderboard(sort, "all")) as {
    result?: { byWalletBalance?: Array<Record<string, unknown>> };
  };
  const raw = data?.result?.byWalletBalance ?? [];
  const seen = new Set<string>();
  const out: EnrichedEntry[] = [];
  for (const r of raw) {
    const e = toEnriched(r);
    const addr = e.account.toLowerCase();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push(e);
  }
  return out;
}

/** Fetch a single user's profile from DeHub API */
async function fetchDeHubUserProfile(account: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `${DEHUB_API_BASE}/api/account_info/${account}`,
      { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) return null;
    const json = await response.json();
    return json?.result ?? json ?? null;
  } catch {
    return null;
  }
}

/**
 * Union of several boards, one entry per address. The first board listed wins
 * on identity fields; numeric fields fall through to whichever board had them.
 */
function unionBoards(boards: EnrichedEntry[][]): EnrichedEntry[] {
  const map = new Map<string, EnrichedEntry>();
  for (const board of boards) {
    for (const e of board) {
      const addr = e.account?.toLowerCase();
      if (!addr) continue;
      const prev = map.get(addr);
      if (!prev) {
        map.set(addr, { ...e });
        continue;
      }
      prev.total = prev.total ?? e.total;
      prev.badgeBalance = prev.badgeBalance ?? e.badgeBalance;
      prev.username = prev.username || e.username;
      prev.userDisplayName = prev.userDisplayName || e.userDisplayName;
      prev.avatarUrl = prev.avatarUrl || e.avatarUrl;
      prev.sentTips = prev.sentTips || e.sentTips;
      prev.receivedTips = prev.receivedTips || e.receivedTips;
      prev.followers = prev.followers ?? e.followers;
      prev.likes = prev.likes ?? e.likes;
      prev.subscribers = prev.subscribers ?? e.subscribers;
      if (e.hideBadgeAndBalance) prev.hideBadgeAndBalance = true;
    }
  }
  return [...map.values()];
}

async function readCachedBoard(supabase: any, sort: string): Promise<EnrichedEntry[]> {
  const { data } = await supabase
    .from("leaderboard_cache")
    .select("data")
    .eq("sort_mode", sort)
    .eq("period", "all")
    .maybeSingle();
  return ((data?.data as any)?.result?.byWalletBalance ?? []) as EnrichedEntry[];
}

const SNAPSHOT_FIELD: Record<string, string> = {
  holdings: "balance",
  sentTips: "sent_tips",
  receivedTips: "received_tips",
  followers: "followers",
  likes: "likes",
  subscribers: "subscribers",
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Snapshot-based delta ────────────────────────────────────────────

interface SnapshotDeltaResult {
  sort: string;
  period: string;
  success: boolean;
  error?: string;
}

async function writePeriodCache(supabase: any, sortMode: string, period: string, periodData: Record<string, unknown>): Promise<SnapshotDeltaResult> {
  const { error } = await supabase.from("leaderboard_cache").upsert(
    { sort_mode: sortMode, period, data: periodData, updated_at: new Date().toISOString() },
    { onConflict: "sort_mode,period" },
  );
  if (error) {
    console.error(`Error caching ${sortMode}/${period}:`, error);
    return { sort: sortMode, period, success: false, error: error.message };
  }
  return { sort: sortMode, period, success: true };
}

/**
 * Pick the snapshot day to diff against. Prefers the newest day at or before
 * the target that passes the quality gates. When no day that old exists (the
 * history is shorter than the window) it falls back to the OLDEST day on
 * record: "change since records began" is the honest answer for a year board
 * over eight months of data, and far better than an empty board.
 */
async function pickPastSnapshotDate(supabase: any, sortMode: string, period: string, targetDate: string): Promise<{ date: string | null; fallback: boolean }> {
  const MIN_SNAPSHOT_ENTRIES = 10;
  const MIN_NONZERO_RATIO = 0.3;

  const passesGates = async (candidateDate: string): Promise<boolean> => {
    const { count: totalCount } = await supabase
      .from("leaderboard_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("snapshot_date", candidateDate);
    if (totalCount === null || totalCount < MIN_SNAPSHOT_ENTRIES) {
      console.warn(`[delta] ${sortMode}/${period}: skipping snapshot ${candidateDate} — only ${totalCount} entries`);
      return false;
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
        return false;
      }
    }
    return true;
  };

  // snapshot_date repeats once per account, so a page of rows covers only a
  // day or two. Walk pages in date order and stop at the first day that
  // passes the gates; give up after a handful of distinct days.
  const firstPassingDate = async (ascending: boolean, lteDate?: string): Promise<string | null> => {
    const seen = new Set<string>();
    const MAX_DISTINCT = 10;
    const MAX_PAGES = 30;
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = supabase.from("leaderboard_snapshots").select("snapshot_date");
      if (lteDate) q = q.lte("snapshot_date", lteDate);
      const { data } = await q
        .order("snapshot_date", { ascending })
        .order("account", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const rows = (data ?? []) as Array<{ snapshot_date: string }>;
      for (const r of rows) {
        if (seen.has(r.snapshot_date)) continue;
        seen.add(r.snapshot_date);
        if (await passesGates(r.snapshot_date)) return r.snapshot_date;
        if (seen.size >= MAX_DISTINCT) return null;
      }
      if (rows.length < PAGE) break;
    }
    return null;
  };

  const exact = await firstPassingDate(false, targetDate);
  if (exact) return { date: exact, fallback: false };

  const oldest = await firstPassingDate(true);
  if (oldest) {
    console.log(`[delta] ${sortMode}/${period}: no snapshot at or before ${targetDate}; using oldest available ${oldest}`);
    return { date: oldest, fallback: true };
  }
  return { date: null, fallback: false };
}

async function computeSnapshotDelta(
  supabase: any,
  ctx: RunContext,
  allEntries: EnrichedEntry[],
  sortMode: string,
  period: string,
  rpcConfig?: { baseRpc: string; bnbRpc: string },
): Promise<SnapshotDeltaResult> {
  try {
    const daysAgo = PERIOD_DAYS[period];
    const isHoldings = sortMode === "holdings";

    const entries = isHoldings
      ? allEntries.filter((e) => !HOLDINGS_PERIOD_EXCLUDED.has(e.account.toLowerCase()) && !e.hideBadgeAndBalance)
      : allEntries;

    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - daysAgo);

    // ── Holdings day/week: pure on-chain, both ends ──
    if (isHoldings && (period === "day" || period === "week") && rpcConfig) {
      console.log(`[delta] ${sortMode}/${period}: PURE ON-CHAIN mode for ${entries.length} addresses`);
      const addresses = entries.map((e) => e.account.toLowerCase());
      const tags = await historicalBlockTags(ctx, rpcConfig, pastDate);
      console.log(`[delta] ${sortMode}/${period}: historical blocks Base=${tags.baseNum}, BNB=${tags.bnbNum} (${pastDate.toISOString()})`);

      const [currentMap, pastMap, currentStakedMap, pastStakedMap] = await Promise.all([
        getLatestBalances(ctx, addresses, rpcConfig),
        batchOnChainBalancesAtBlock(addresses, rpcConfig.baseRpc, rpcConfig.bnbRpc, tags.base, tags.bnb, `${sortMode}/${period} past`),
        getCurrentStaked(ctx, supabase),
        fetchNetStakedMap(supabase, pastDate.toISOString()),
      ]);
      console.log(`[delta] ${sortMode}/${period}: ${currentMap.size} current + ${pastMap.size} historical balances`);

      let unknown = 0;
      const withDeltas: EnrichedEntry[] = [];
      for (const entry of entries) {
        const addr = entry.account.toLowerCase();
        const cur = currentMap.get(addr);
        const past = pastMap.get(addr);
        if (cur === undefined || past === undefined) { unknown++; continue; }
        const currentVal = cur + (currentStakedMap.get(addr) || 0);
        const pastVal = past + (pastStakedMap.get(addr) || 0);
        withDeltas.push({ ...entry, delta: currentVal - pastVal, total: currentVal, badgeBalance: currentVal });
      }
      if (unknown > 0) console.warn(`[delta] ${sortMode}/${period}: ${unknown} entries skipped (balance unknown at one end)`);

      const sorted = withDeltas
        .filter((e) => e.delta !== undefined && e.delta !== 0)
        .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

      const res = await writePeriodCache(supabase, sortMode, period, {
        result: { byWalletBalance: sorted },
        hasHistoricalData: true,
        onChainMode: true,
      });
      if (res.success) {
        const gains = sorted.filter((e) => (e.delta ?? 0) > 0).length;
        console.log(`[delta] ${sortMode}/${period}: ${sorted.length} non-zero (${gains} gains, ${sorted.length - gains} losses)`);
      }
      return res;
    }

    // ── Snapshot path (hybrid on-chain for holdings month/year) ──
    const useHybridOnChain = isHoldings && (period === "month" || period === "year") && !!rpcConfig;
    const pastDateStr = pastDate.toISOString().split("T")[0];
    const snapshotField = SNAPSHOT_FIELD[sortMode] || sortMode;

    const { date: closestDate, fallback: usedOldest } = await pickPastSnapshotDate(supabase, sortMode, period, pastDateStr);

    let pastMap = new Map<string, number>();
    if (closestDate) {
      pastMap = await fetchSnapshotDay(supabase, closestDate, snapshotField);
      console.log(`[delta] ${sortMode}/${period}: past snapshot ${closestDate}${usedOldest ? " (oldest on record)" : ""}, ${pastMap.size} entries`);
    } else {
      console.log(`[delta] ${sortMode}/${period}: no usable snapshot on record`);
    }

    // Wallets missing from the past snapshot get a real on-chain read at the
    // same moment the snapshot describes (the 04:00 UTC run), not a guess.
    let hybridPastMap: Map<string, number> | null = null;
    let hybridStakedPast: Map<string, number> | null = null;
    if (useHybridOnChain) {
      const newAddresses = entries.map((e) => e.account.toLowerCase()).filter((a) => !pastMap.has(a));
      if (newAddresses.length > 0) {
        const at = closestDate ? new Date(`${closestDate}T04:00:00Z`) : pastDate;
        try {
          const tags = await historicalBlockTags(ctx, rpcConfig!, at);
          console.log(`[delta] ${sortMode}/${period}: HYBRID — ${pastMap.size} from snapshot, ${newAddresses.length} on-chain at Base=${tags.baseNum}, BNB=${tags.bnbNum}`);
          [hybridPastMap, hybridStakedPast] = await Promise.all([
            batchOnChainBalancesAtBlock(newAddresses, rpcConfig!.baseRpc, rpcConfig!.bnbRpc, tags.base, tags.bnb, `${sortMode}/${period} hybrid past`),
            fetchNetStakedMap(supabase, at.toISOString()),
          ]);
        } catch (rpcErr) {
          console.warn(`[delta] ${sortMode}/${period}: hybrid on-chain lookup failed, snapshot-only:`, rpcErr);
        }
      }
    }

    // ── Current values ──
    // Today's snapshot (API totals, pool stake included) when it exists;
    // otherwise raw chain + pool stake for holdings, or the API row itself.
    const todaySnap = await fetchSnapshotDay(supabase, todayStr(), snapshotField);
    let currentMap: Map<string, number> | null = null;
    let currentFromChain = false;
    if (todaySnap.size > 0) {
      currentMap = todaySnap;
      console.log(`[delta] ${sortMode}/${period}: current from today's snapshot (${todaySnap.size} entries)`);
    } else if (useHybridOnChain) {
      currentMap = await getLatestBalances(ctx, entries.map((e) => e.account.toLowerCase()), rpcConfig!);
      currentFromChain = true;
      console.log(`[delta] ${sortMode}/${period}: no today snapshot; current from chain (${currentMap.size} entries)`);
    } else {
      console.log(`[delta] ${sortMode}/${period}: no today snapshot; current from API rows`);
    }
    const currentStaked = currentFromChain ? await getCurrentStaked(ctx, supabase) : null;

    const getEntryValue = (entry: EnrichedEntry): number | undefined => {
      if (isHoldings) return entry.total ?? undefined;
      if (sortMode === "sentTips") return entry.sentTips;
      if (sortMode === "receivedTips") return entry.receivedTips;
      return (entry as any)[sortMode] ?? undefined;
    };

    // Social day/week: a wallet that was not on yesterday's board has no
    // known starting point, and "everything it has, gained today" is not a
    // claim worth making for a one-day window.
    const requireRealPast = (period === "day" || period === "week") &&
      (SOCIAL_METRICS as readonly string[]).includes(sortMode);

    let unknown = 0;
    let entered = 0;
    const withDeltas: EnrichedEntry[] = [];
    for (const entry of entries) {
      if ((SOCIAL_METRICS as readonly string[]).includes(sortMode)) {
        if (((entry as any)[sortMode] as number ?? 0) <= 0) continue;
      }
      const addr = entry.account.toLowerCase();

      let currentVal: number | undefined;
      if (currentMap) {
        currentVal = currentMap.get(addr);
        if (currentVal !== undefined && currentStaked) currentVal += currentStaked.get(addr) || 0;
      } else {
        currentVal = getEntryValue(entry);
      }
      if (currentVal === undefined) { unknown++; continue; }

      let pastVal = pastMap.get(addr);
      if (pastVal === undefined && hybridPastMap) {
        const chainPast = hybridPastMap.get(addr);
        if (chainPast !== undefined) pastVal = chainPast + (hybridStakedPast?.get(addr) || 0);
      }

      let delta: number;
      if (pastVal !== undefined) {
        delta = currentVal - pastVal;
      } else if (requireRealPast) {
        unknown++;
        continue;
      } else {
        // Absent from the earliest point we can see: it entered during the window.
        delta = currentVal;
        entered++;
      }
      withDeltas.push({ ...entry, delta });
    }
    if (unknown > 0) console.log(`[delta] ${sortMode}/${period}: ${unknown} entries skipped (no known value at one end)`);
    if (entered > 0) console.log(`[delta] ${sortMode}/${period}: ${entered} entries counted from zero (not in past snapshot)`);

    const isBidirectional = useHybridOnChain;
    const sorted = withDeltas
      .filter((e) => e.delta !== undefined && (isBidirectional ? e.delta !== 0 : e.delta > 0))
      .sort((a, b) => isBidirectional
        ? Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
        : (b.delta ?? 0) - (a.delta ?? 0));

    const res = await writePeriodCache(supabase, sortMode, period, {
      result: { byWalletBalance: sorted },
      hasHistoricalData: closestDate !== null || (!!hybridPastMap && hybridPastMap.size > 0),
      ...(usedOldest && closestDate ? { historySince: closestDate } : {}),
      ...(isBidirectional ? { hybridOnChainMode: true } : {}),
    });
    if (res.success) {
      if (isBidirectional) {
        const gains = sorted.filter((e) => (e.delta ?? 0) > 0).length;
        console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries (${gains} gains, ${sorted.length - gains} losses) — hybrid on-chain mode`);
      } else {
        console.log(`[delta] ${sortMode}/${period}: ${sorted.length} entries with positive delta`);
      }
    }
    return res;
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
    let filterPeriods: string[] | null = null;
    let filterSorts: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.mode === "light") mode = "light";
      if (Array.isArray(body?.periods)) filterPeriods = body.periods;
      if (Array.isArray(body?.sorts)) filterSorts = body.sorts;
    } catch {
      // No body or invalid JSON — default to full
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const alchemyKey = Deno.env.get("ALCHEMY_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ctx = newRunContext();

    const rpcConfig = alchemyKey ? {
      baseRpc: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      bnbRpc: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
    } : undefined;

    if (!rpcConfig) {
      console.warn("[refresh] ALCHEMY_API_KEY not set — holdings periods will use snapshot-based deltas only");
    }

    const results: SnapshotDeltaResult[] = [];
    const activePeriods = filterPeriods
      ? DELTA_PERIODS.filter((p) => filterPeriods!.includes(p))
      : [...DELTA_PERIODS];
    const activeSorts: SortMode[] = filterSorts
      ? ALL_SORT_MODES.filter((s) => filterSorts!.includes(s))
      : [...ALL_SORT_MODES];

    // ================================================================
    // LIGHT MODE: recompute period caches from cached 'all' boards,
    // snapshots and (for holdings) the chain. No API calls.
    // ================================================================
    if (mode === "light") {
      console.log("Starting LIGHT leaderboard cache refresh...");

      const { count: todaySnapCount } = await supabase
        .from("leaderboard_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", todayStr());
      const hasTodaySnapshot = !!todaySnapCount && todaySnapCount > 0;
      const holdingsOnlyWithRpc = activeSorts.length === 1 && activeSorts[0] === "holdings" && !!rpcConfig;

      if (!hasTodaySnapshot && !holdingsOnlyWithRpc) {
        console.warn("[light] No snapshot for today yet — skipping to avoid bad deltas");
        return new Response(
          JSON.stringify({ success: true, mode: "light", message: "Skipped: no today snapshot yet" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const boards = new Map<SortMode, EnrichedEntry[]>();
      for (const sort of ALL_SORT_MODES) boards.set(sort, await readCachedBoard(supabase, sort));
      const holdingsEntries = boards.get("holdings") ?? [];
      const unionEntries = unionBoards(ALL_SORT_MODES.map((s) => boards.get(s) ?? []));

      if (holdingsEntries.length === 0 && unionEntries.length === 0) {
        console.warn("[light] No cached 'all' boards found — run a full refresh first.");
        return new Response(
          JSON.stringify({ success: false, mode: "light", error: "No cached boards available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      console.log(`[light] holdings/all: ${holdingsEntries.length} entries; union of six boards: ${unionEntries.length}`);
      console.log(`[light] Periods: ${activePeriods.join(", ")} | Sorts: ${activeSorts.join(", ")}`);

      for (const sortMode of activeSorts) {
        const entries = sortMode === "holdings" ? holdingsEntries : unionEntries;
        for (const period of activePeriods) {
          results.push(await computeSnapshotDelta(supabase, ctx, entries, sortMode, period, sortMode === "holdings" ? rpcConfig : undefined));
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`LIGHT refresh complete: ${successCount}/${results.length} successful`);
      return new Response(
        JSON.stringify({ success: true, mode: "light", message: `Light refresh: cached ${successCount}/${results.length} combinations`, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // ================================================================
    // FULL MODE: six API boards + daily snapshot + all periods
    // ================================================================
    console.log("Starting FULL leaderboard cache refresh...");

    // ── 1. Fetch every 'all' board from the API, each with its own sort ──
    const boards = new Map<SortMode, EnrichedEntry[]>();
    for (const sort of ALL_SORT_MODES) {
      try {
        const board = await fetchAllBoard(sort);
        boards.set(sort, board);
        console.log(`API ${sort}/all: ${board.length} entries`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error fetching ${sort}/all:`, msg);
        results.push({ sort, period: "all", success: false, error: msg });
      }
    }

    // ── 2. Holdings: inject or repair the extra wallets ──
    const holdings = boards.get("holdings");
    if (holdings) {
      const idx = new Map(holdings.map((e, i) => [e.account.toLowerCase(), i]));
      for (const [username, config] of Object.entries(EXTRA_WALLETS)) {
        const addr = config.wallet.toLowerCase();
        const existingIdx = idx.get(addr);
        const existing = existingIdx !== undefined ? holdings[existingIdx] : null;
        if (existing && (existing.total ?? 0) > 0) continue;
        try {
          const profile = await fetchDeHubUserProfile(config.wallet);
          // badgeBalance can be 0 even when the wallet has tokens; fall back to balanceData.
          let balance = (profile?.badgeBalance as number) ?? 0;
          if (balance === 0 && Array.isArray(profile?.balanceData)) {
            for (const bd of profile!.balanceData as Array<{ walletBalance?: number; staked?: number }>) {
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
            holdings[existingIdx] = entry;
            console.log(`Extra wallet ${username} (${addr}): overrode zero-balance entry with ${balance} DHB`);
          } else if (balance > 0) {
            holdings.push(entry);
            console.log(`Extra wallet ${username} (${addr}): added with ${balance} DHB`);
          } else {
            console.warn(`Extra wallet ${username} (${addr}): balance is 0 even from account_info`);
          }
        } catch (err) {
          console.error(`Failed to fetch extra wallet ${username}:`, err);
        }
      }
      // Pool stake already arrives in the API total (dehub-stream-backend
      // PR #206); adding staking_records here again would count it twice.
      holdings.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    }

    // ── 3. Daily snapshot: union of every board, one row per address ──
    const union = unionBoards(ALL_SORT_MODES.map((s) => boards.get(s) ?? []));
    const today = todayStr();
    const { count: snapshotCount } = await supabase
      .from("leaderboard_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("snapshot_date", today);

    if (!snapshotCount || snapshotCount === 0) {
      if (boards.size < ALL_SORT_MODES.length) {
        console.warn(`Only ${boards.size}/${ALL_SORT_MODES.length} boards fetched — snapshot for ${today} will be partial`);
      }
      console.log(`Creating daily snapshot for ${today} from ${union.length} accounts...`);
      const snapshotRows = union.map((e) => ({
        account: e.account.toLowerCase(),
        balance: e.total ?? 0,
        followers: e.followers ?? 0,
        likes: e.likes ?? 0,
        subscribers: e.subscribers ?? 0,
        sent_tips: e.sentTips,
        received_tips: e.receivedTips,
        snapshot_date: today,
      }));
      for (let i = 0; i < snapshotRows.length; i += 100) {
        const { error: snapErr } = await supabase
          .from("leaderboard_snapshots")
          .upsert(snapshotRows.slice(i, i + 100), { onConflict: "account,snapshot_date" });
        if (snapErr) console.error(`Snapshot upsert error (batch ${i}):`, snapErr);
      }
      console.log(`Snapshot saved: ${snapshotRows.length} entries`);
      try {
        await supabase.rpc("cleanup_old_leaderboard_snapshots");
      } catch (cleanupErr) {
        console.error("Snapshot cleanup error:", cleanupErr);
      }
    } else {
      console.log(`Snapshot for ${today} already exists (${snapshotCount} rows), skipping`);
    }

    // ── 4. Cache every 'all' board ──
    for (const [sort, board] of boards) {
      const { error } = await supabase.from("leaderboard_cache").upsert(
        { sort_mode: sort, period: "all", data: { result: { byWalletBalance: board } }, updated_at: new Date().toISOString() },
        { onConflict: "sort_mode,period" },
      );
      if (error) {
        console.error(`Error caching ${sort}/all:`, error);
        results.push({ sort, period: "all", success: false, error: error.message });
      } else {
        results.push({ sort, period: "all", success: true });
      }
    }

    // ── 5. Period boards ──
    for (const sortMode of activeSorts) {
      if (!boards.has(sortMode)) {
        DELTA_PERIODS.forEach((p) => results.push({ sort: sortMode, period: p, success: false, error: "'all' board unavailable" }));
        continue;
      }
      const entries = sortMode === "holdings" ? (boards.get("holdings") ?? []) : union;
      for (const period of activePeriods) {
        results.push(await computeSnapshotDelta(supabase, ctx, entries, sortMode, period, sortMode === "holdings" ? rpcConfig : undefined));
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Error refreshing leaderboard cache:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
