// The once-a-minute DEX snapshot, read here instead of inside Postgres.
//
// dex_private.sample_market() built the /dex snapshot from plpgsql: one HTTP
// round trip per position per read, sequentially, over public RPCs, with a
// hard "exceeded the minute, throw it all away" rule. That was fine at a dozen
// positions and is exactly the thing that goes stale the moment the book gets
// busy. This function does the same job with one Multicall3 call per chain,
// the Alchemy key the rest of the stack already uses, and a budget that a
// hundred positions do not dent. It then hands the finished sample to
// record_dex_market_sample(), which owns the tables, the candles and the
// heartbeat exactly as before; nothing about the payload the clients read
// changes shape.
//
// Two things the SQL sampler stopped doing on its last rewrite come back here:
// positions discovered from PoolManager logs (dex_pool_positions) are sampled
// again, and the deposit a listing shows is derived from the position's own
// liquidity and ticks rather than trusted from the row the client wrote.
//
// The SQL sampler stays as the fallback: its cron now only fires when this
// function has not written a snapshot for ninety seconds.

import { Interface } from "https://esm.sh/ethers@6.13.4";
import { corsHeaders } from "../_shared/cors.ts";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** Skip when the last snapshot is this fresh: the page opens this endpoint too, and a burst must cost nothing. */
const FRESH_SECONDS = 45;
/** Discovered rows beyond this are the oldest and the least likely to still hold liquidity. */
const MAX_DISCOVERED = 500;

interface ChainConfig {
  manager: string;
  stateView: string;
  usdc: string;
  dhb: string;
  usdcDecimals: number;
  /** currency0 is USDC on Base and DHB on BNB Chain. */
  dhbIsToken0: boolean;
  pools: Record<string, string>;
  rpc: (key: string) => string;
  fallbacks: string[];
}
const CHAINS: Record<number, ChainConfig> = {
  8453: {
    manager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
    stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    dhb: "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c",
    usdcDecimals: 6,
    dhbIsToken0: false,
    pools: { "0:1": "0x9c07d4b06fd20498a3cacb80610b55dbbb7b3d79df07db20caccecc4e65155ec", "3000:60": "0xab3b4bd9a7625c641d0c73dbe3e016ae986c6a9e0fb026697c27ef231d360dd0" },
    rpc: (key) => `https://base-mainnet.g.alchemy.com/v2/${key}`,
    fallbacks: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  },
  56: {
    manager: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b",
    stateView: "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4",
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    dhb: "0x680d3113caf77b61b510f332d5ef4cf5b41a761d",
    usdcDecimals: 18,
    dhbIsToken0: true,
    pools: { "0:1": "0x64d6da98b6238b7626aa8fd50be27c362079c0103e07d6e2b3ec9eb438c92c98", "3000:60": "0xf237a2bbd437c15b6507d720abc4155aacb87591f8a701ef61a1354963d23ea7" },
    rpc: (key) => `https://bnb-mainnet.g.alchemy.com/v2/${key}`,
    fallbacks: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"],
  },
};

const multicall = new Interface(["function tryAggregate(bool requireSuccess,(address target,bytes callData)[] calls) returns ((bool success,bytes returnData)[])"]);
const manager = new Interface([
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const stateView = new Interface(["function getSlot0(bytes32 poolId) view returns (uint160,int24,uint24,uint24)"]);
const erc20 = new Interface(["function balanceOf(address) view returns (uint256)"]);
const v3 = new Interface([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function tickBitmap(int16) view returns (uint256)",
  "function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)",
]);
const v2 = new Interface(["function getReserves() view returns (uint112,uint112,uint32)"]);

function makeRpc(urls: string[]) {
  return async function rpc(method: string, params: unknown[]): Promise<any> {
    let last: unknown;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.error) throw new Error(typeof json.error === "object" ? json.error.message : String(json.error));
        return json.result;
      } catch (error) { last = error; }
    }
    throw new Error(`${method} failed: ${last instanceof Error ? last.message : String(last)}`);
  };
}
type Rpc = ReturnType<typeof makeRpc>;

/** One eth_call for every read on a chain. A failed inner call comes back as success=false, never as a thrown batch. */
async function aggregate(rpc: Rpc, calls: { target: string; callData: string }[]): Promise<{ success: boolean; returnData: string }[]> {
  if (!calls.length) return [];
  const data = multicall.encodeFunctionData("tryAggregate", [false, calls]);
  const raw = await rpc("eth_call", [{ to: MULTICALL3, data }, "latest"]);
  const [results] = multicall.decodeFunctionResult("tryAggregate", raw);
  return results.map((r: any) => ({ success: Boolean(r[0] ?? r.success), returnData: String(r[1] ?? r.returnData) }));
}

const tickPrice = (tick: number) => Math.pow(1.0001, tick);
const rootAt = (tick: number) => Math.pow(1.0001, tick / 2);

interface InputRow {
  chain_id: number; token_id: string; owner_address: string | null; mint_tx_hash: string; created_at: string;
  side: string | null; dhb_amount: number | null; usdc_amount: number | null;
  min_usdc_per_dhb: number | null; max_usdc_per_dhb: number | null; app_indexed: boolean; verified: boolean;
}
interface Sampled extends Record<string, unknown> { chain_id: number; token_id: string; side: string; amountDhb: number; amountUsdc: number; marketPrice: number; minPrice: number; maxPrice: number }

async function sampleChain(chainId: number, rows: InputRow[], rpc: Rpc): Promise<{ positions: Sampled[]; verified: { chain_id: number; token_id: string }[]; block: string }> {
  const cfg = CHAINS[chainId];
  const block = await rpc("eth_blockNumber", []);
  // Self-reported owners prove their mint once; the receipt is then remembered by the database.
  const newlyVerified: { chain_id: number; token_id: string }[] = [];
  const proven = new Set<string>();
  for (const row of rows) {
    if (!row.app_indexed || row.verified) { proven.add(row.token_id); continue; }
    try {
      const receipt = await rpc("eth_getTransactionReceipt", [row.mint_tx_hash]);
      const ok = receipt?.status === "0x1" && (receipt.logs as any[]).some((log) =>
        String(log.address).toLowerCase() === cfg.manager && log.topics?.[0] === TRANSFER_TOPIC &&
        log.topics[1] === "0x" + "0".repeat(64) &&
        String(log.topics[2]).toLowerCase() === "0x" + String(row.owner_address).slice(2).toLowerCase().padStart(64, "0") &&
        BigInt(log.topics[3]) === BigInt(row.token_id));
      if (ok) { proven.add(row.token_id); newlyVerified.push({ chain_id: chainId, token_id: row.token_id }); }
    } catch { /* An unreadable receipt keeps the row out of this minute, not out of the index. */ }
  }
  const live = rows.filter((row) => proven.has(row.token_id));
  const poolIds = Object.values(cfg.pools);
  const calls = [
    ...poolIds.map((id) => ({ target: cfg.stateView, callData: stateView.encodeFunctionData("getSlot0", [id]) })),
    ...live.flatMap((row) => [
      { target: cfg.manager, callData: manager.encodeFunctionData("getPositionLiquidity", [row.token_id]) },
      { target: cfg.manager, callData: manager.encodeFunctionData("getPoolAndPositionInfo", [row.token_id]) },
      { target: cfg.manager, callData: manager.encodeFunctionData("ownerOf", [row.token_id]) },
    ]),
  ];
  const results = await aggregate(rpc, calls);
  const slots = new Map<string, { root: number; tick: number }>();
  poolIds.forEach((id, i) => {
    const r = results[i];
    if (!r.success) return;
    const [sqrt, tick] = stateView.decodeFunctionResult("getSlot0", r.returnData);
    const root = Number(sqrt) / 2 ** 96;
    if (root > 0) slots.set(id, { root, tick: Number(tick) });
  });
  const positions: Sampled[] = [];
  live.forEach((row, i) => {
    const base = poolIds.length + i * 3;
    const [liqRes, infoRes, ownerRes] = [results[base], results[base + 1], results[base + 2]];
    if (!liqRes?.success || !infoRes?.success || !ownerRes?.success) return;
    const liquidity = BigInt(manager.decodeFunctionResult("getPositionLiquidity", liqRes.returnData)[0]);
    if (liquidity === 0n) return;
    const [poolKey, packed] = manager.decodeFunctionResult("getPoolAndPositionInfo", infoRes.returnData);
    const c0 = String(poolKey.currency0 ?? poolKey[0]).toLowerCase(), c1 = String(poolKey.currency1 ?? poolKey[1]).toLowerCase();
    const expected0 = cfg.dhbIsToken0 ? cfg.dhb : cfg.usdc, expected1 = cfg.dhbIsToken0 ? cfg.usdc : cfg.dhb;
    if (c0 !== expected0 || c1 !== expected1) return;
    const fee = Number(poolKey.fee ?? poolKey[2]), spacing = Number(poolKey.tickSpacing ?? poolKey[3]);
    const hooks = String(poolKey.hooks ?? poolKey[4]);
    const poolId = cfg.pools[`${fee}:${spacing}`];
    if (!poolId || BigInt(hooks) !== 0n) return;
    const info = BigInt(packed);
    const unpack = (shift: bigint) => { const t = Number((info >> shift) & 0xffffffn); return t >= 0x800000 ? t - 0x1000000 : t; };
    const lower = unpack(8n), upper = unpack(32n);
    if (lower >= upper || lower < -887272 || upper > 887272) return;
    const slot = slots.get(poolId);
    if (!slot) return;
    const rootLo = rootAt(lower), rootHi = rootAt(upper), root = slot.root;
    const clamped = Math.min(rootHi, Math.max(rootLo, root));
    const liq = Number(liquidity);
    const amount0 = Math.floor(liq * (rootHi - clamped) / (clamped * rootHi));
    const amount1 = Math.floor(liq * (clamped - rootLo));
    const usdcScale = 10 ** cfg.usdcDecimals;
    const dhb = (cfg.dhbIsToken0 ? amount0 : amount1) / 1e18;
    const usdc = (cfg.dhbIsToken0 ? amount1 : amount0) / usdcScale;
    // Price is USDC per DHB. On Base (DHB = token1) the pool ratio is the inverse of that.
    const priceAt = (tick: number) => cfg.dhbIsToken0 ? tickPrice(tick) * 10 ** (18 - cfg.usdcDecimals) : 10 ** (18 - cfg.usdcDecimals) / tickPrice(tick);
    const minPrice = Math.min(priceAt(lower), priceAt(upper)), maxPrice = Math.max(priceAt(lower), priceAt(upper));
    const marketPrice = cfg.dhbIsToken0 ? root * root * 10 ** (18 - cfg.usdcDecimals) : 10 ** (18 - cfg.usdcDecimals) / (root * root);
    const owner = "0x" + String(manager.decodeFunctionResult("ownerOf", ownerRes.returnData)[0]).slice(2).toLowerCase();
    // Outside positions declare no side. A range holding only DHB is an offer to sell it, one
    // holding only USDC an offer to buy; a two-sided range is read by whichever leg is larger.
    const side = row.side === "buy" || row.side === "sell" ? row.side : usdc <= 0 ? "sell" : dhb <= 0 ? "buy" : dhb * marketPrice >= usdc ? "sell" : "buy";
    const status = side === "sell"
      ? (marketPrice >= maxPrice ? "Filled" : marketPrice <= minPrice ? "Open" : "In range")
      : (marketPrice <= minPrice ? "Filled" : marketPrice >= maxPrice ? "Open" : "In range");
    // What was deposited, from the position itself: an order placed through the app is
    // single-sided by construction, so its whole liquidity was one token at mint and that
    // quantity is fixed by liquidity and ticks alone. Nothing the client wrote is trusted for
    // the number shown. An outside position may have been two-sided, so it shows only what
    // it holds now.
    const wholeDhb = (cfg.dhbIsToken0 ? liq * (rootHi - rootLo) / (rootLo * rootHi) : liq * (rootHi - rootLo)) / 1e18;
    const wholeUsdc = (cfg.dhbIsToken0 ? liq * (rootHi - rootLo) : liq * (rootHi - rootLo) / (rootLo * rootHi)) / usdcScale;
    const deposit = row.app_indexed && (row.side === "buy" || row.side === "sell");
    positions.push({
      chain_id: chainId, token_id: row.token_id, mint_tx_hash: row.mint_tx_hash,
      owner_address: row.owner_address ?? owner, created_at: row.created_at,
      dhb_amount: deposit && side === "sell" ? wholeDhb : null, usdc_amount: deposit && side === "buy" ? wholeUsdc : null,
      min_usdc_per_dhb: row.min_usdc_per_dhb ?? minPrice, max_usdc_per_dhb: row.max_usdc_per_dhb ?? maxPrice,
      side, indexed: row.app_indexed,
      owner, liquidity: liquidity.toString(), tickLower: lower, tickUpper: upper, poolFee: fee, tickSpacing: spacing,
      minPrice, maxPrice, marketPrice, amountDhb: dhb, amountUsdc: usdc, status,
    });
  });
  return { positions, verified: newlyVerified, block };
}

/** ETH and BNB in dollars. Everything else the pool registry quotes in is a dollar stablecoin. */
async function quoteUsd(): Promise<Record<string, number>> {
  const res = await fetch("https://data-api.binance.vision/api/v3/ticker/price", { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Price feed HTTP ${res.status}`);
  const rows: { symbol: string; price: string }[] = await res.json();
  const find = (s: string) => Number(rows.find((r) => r.symbol === s)?.price);
  const eth = find("ETHUSDT"), bnb = find("BNBUSDT");
  if (!(eth > 0 && bnb > 0)) throw new Error("Price feed incomplete");
  return { ETH: eth, BNB: bnb, USD: 1 };
}

const AMM_POOLS = [
  { chain: 8453, pool: "0xebdeacaf03ba54eb18128fd1fd042bc747af9295", version: 3, dhb: CHAINS[8453].dhb, quote: "0x4200000000000000000000000000000000000006", quoteDecimals: 18, symbol: "ETH", dhbIsToken0: false },
  { chain: 56, pool: "0x0b1598fa339c4848abe98afc80cb413f91c7f27d", version: 3, dhb: CHAINS[56].dhb, quote: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", quoteDecimals: 18, symbol: "BNB", dhbIsToken0: true },
  { chain: 56, pool: "0xde1c563faed1a984b209da79b904f5a8c9ed78b0", version: 3, dhb: CHAINS[56].dhb, quote: "0x55d398326f99059ff775485246999027b3197955", quoteDecimals: 18, symbol: "USD", dhbIsToken0: false },
  { chain: 56, pool: "0xfbb110e6a58fa8be44587ce0ab5617b18d57040b", version: 2, dhb: CHAINS[56].dhb, quote: "0x55d398326f99059ff775485246999027b3197955", quoteDecimals: 18, symbol: "USD", dhbIsToken0: false },
];
/** A pool holding less than this is noise: the drained BNB pools report prices near 1e-36. */
const PRICE_FLOOR_USD = 100;

/** Lowest DHB price across the AMM pools outside the order book, plus both LP sides reported apart. */
async function aggregateMarket(rpcs: Record<number, Rpc>, usd: Record<string, number>) {
  let lowest: number | null = null, quoteUsdTotal = 0, dhbTokens = 0;
  for (const chain of [8453, 56]) {
    const pools = AMM_POOLS.filter((p) => p.chain === chain);
    const calls = pools.flatMap((p) => [
      { target: p.dhb, callData: erc20.encodeFunctionData("balanceOf", [p.pool]) },
      { target: p.quote, callData: erc20.encodeFunctionData("balanceOf", [p.pool]) },
      { target: p.pool, callData: p.version === 3 ? v3.encodeFunctionData("slot0", []) : v2.encodeFunctionData("getReserves", []) },
    ]);
    let results: { success: boolean; returnData: string }[];
    try { results = await aggregate(rpcs[chain], calls); } catch { continue; }
    pools.forEach((p, i) => {
      const [bal0, bal1, state] = [results[i * 3], results[i * 3 + 1], results[i * 3 + 2]];
      if (!bal0?.success || !bal1?.success || !state?.success) return;
      const quotePrice = usd[p.symbol];
      const dhbBalance = Number(BigInt(erc20.decodeFunctionResult("balanceOf", bal0.returnData)[0])) / 1e18;
      const quoteBalance = Number(BigInt(erc20.decodeFunctionResult("balanceOf", bal1.returnData)[0])) / 10 ** p.quoteDecimals;
      dhbTokens += dhbBalance;
      quoteUsdTotal += quoteBalance * quotePrice;
      let ratio: number;
      if (p.version === 3) {
        const [sqrt] = v3.decodeFunctionResult("slot0", state.returnData);
        ratio = (Number(sqrt) / 2 ** 96) ** 2;
      } else {
        const [r0, r1] = v2.decodeFunctionResult("getReserves", state.returnData);
        if (BigInt(r0) === 0n) return;
        ratio = Number(r1) / Number(r0);
      }
      if (!(ratio > 0)) return;
      const price = quotePrice * (p.dhbIsToken0 ? ratio * 10 ** (18 - p.quoteDecimals) : 10 ** (p.quoteDecimals - 18) / ratio);
      const value = dhbBalance * price + quoteBalance * quotePrice;
      if (!(price > 0) || value < PRICE_FLOOR_USD) return;
      lowest = lowest == null ? price : Math.min(lowest, price);
    });
  }
  return { lowest, quoteUsd: quoteUsdTotal, dhbTokens };
}

/** Walk the Base Uniswap V3 DHB/WETH pool into dollar-priced ask levels: each tick range below the price is real ask depth. */
async function basePoolAsks(rpc: Rpc, eth: number): Promise<{ price: number; dhb: number }[]> {
  const pool = "0xebdeacaf03ba54eb18128fd1fd042bc747af9295", spacing = 200;
  const head = await aggregate(rpc, [
    { target: pool, callData: v3.encodeFunctionData("slot0", []) },
    { target: pool, callData: v3.encodeFunctionData("liquidity", []) },
  ]);
  if (!head[0].success || !head[1].success) return [];
  const [sqrt, tickRaw] = v3.decodeFunctionResult("slot0", head[0].returnData);
  let sqrtHi = Number(sqrt) / 2 ** 96;
  const tickNow = Number(tickRaw);
  let liq = Number(BigInt(v3.decodeFunctionResult("liquidity", head[1].returnData)[0]));
  const compressedNow = Math.floor(tickNow / spacing);
  const topWord = compressedNow >> 8;
  const words = [topWord, topWord - 1, topWord - 2, topWord - 3].filter((w) => w >= 0);
  const bitmaps = await aggregate(rpc, words.map((w) => ({ target: pool, callData: v3.encodeFunctionData("tickBitmap", [w]) })));
  const ticks: number[] = [];
  words.forEach((w, i) => {
    if (!bitmaps[i].success) return;
    const bits = BigInt(v3.decodeFunctionResult("tickBitmap", bitmaps[i].returnData)[0]);
    if (bits === 0n) return;
    for (let bit = 0; bit < 256; bit++) {
      if ((bits >> BigInt(bit)) & 1n) {
        const compressed = w * 256 + bit;
        if (compressed * spacing <= tickNow) ticks.push(compressed * spacing);
      }
    }
  });
  ticks.sort((a, b) => b - a);
  if (!ticks.length) return [];
  const nets = await aggregate(rpc, ticks.map((t) => ({ target: pool, callData: v3.encodeFunctionData("ticks", [t]) })));
  const levels: { price: number; dhb: number }[] = [];
  ticks.forEach((t, i) => {
    const sqrtLo = rootAt(t);
    if (liq > 0 && sqrtHi > sqrtLo) {
      const dhb = liq * (sqrtHi - sqrtLo) / 1e18;
      if (dhb > 0.000001) levels.push({ price: eth / (sqrtHi * sqrtHi), dhb });
    }
    if (nets[i]?.success) {
      const [, net] = v3.decodeFunctionResult("ticks", nets[i].returnData);
      liq -= Number(BigInt(net));
    }
    sqrtHi = sqrtLo;
  });
  return levels;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = Deno.env.get("ALCHEMY_API_KEY");
  if (!url || !service) return json({ error: "Service configuration missing" }, 500);
  const call = async (fn: string, body: unknown) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  };
  const started = Date.now();
  try {
    const input = await call("dex_market_sample_input", { p_max_discovered: MAX_DISCOVERED });
    const lastObserved = Number(input?.observedAt ?? 0);
    if (lastObserved > Date.now() / 1000 - FRESH_SECONDS) return json({ skipped: "fresh", observedAt: lastObserved });
    const rows: InputRow[] = input?.rows ?? [];
    const rpcs: Record<number, Rpc> = {};
    for (const id of Object.keys(CHAINS)) {
      const cfg = CHAINS[Number(id)];
      rpcs[Number(id)] = makeRpc([...(key ? [cfg.rpc(key)] : []), ...cfg.fallbacks]);
    }
    const byChain = new Map<number, InputRow[]>();
    for (const row of rows) byChain.set(row.chain_id, [...(byChain.get(row.chain_id) ?? []), row]);
    const positions: Sampled[] = [];
    const verified: { chain_id: number; token_id: string }[] = [];
    const blocks: Record<string, string> = {};
    // A chain that cannot be read costs this minute for that chain, not the whole snapshot.
    const failures: Record<string, string> = {};
    for (const [chainId, chainRows] of byChain) {
      try {
        const sampled = await sampleChain(chainId, chainRows, rpcs[chainId]);
        positions.push(...sampled.positions); verified.push(...sampled.verified); blocks[String(chainId)] = sampled.block;
      } catch (error) { failures[String(chainId)] = error instanceof Error ? error.message : String(error); }
    }
    if (byChain.size && Object.keys(failures).length === byChain.size) throw new Error(`Every chain failed: ${JSON.stringify(failures)}`);
    // Best ask on the order book itself, for the seeded ticket price.
    let best: number | null = null;
    for (const p of positions) {
      const ask = Math.max(p.minPrice, p.marketPrice);
      if (p.side === "sell" && p.amountDhb > 1e-9 && ask < p.maxPrice) best = best == null ? ask : Math.min(best, ask);
    }
    // Neither outside read may cost the snapshot: both are extras on top of the order book.
    let usd: Record<string, number> | null = null;
    try { usd = await quoteUsd(); } catch { usd = null; }
    let pool: { lowest: number | null; quoteUsd: number; dhbTokens: number } = { lowest: null, quoteUsd: 0, dhbTokens: 0 };
    let externalAsks: { price: number; dhb: number }[] = [];
    if (usd) {
      try { pool = await aggregateMarket(rpcs, usd); } catch { /* keep defaults */ }
      try { externalAsks = await basePoolAsks(rpcs[8453], usd.ETH); } catch { externalAsks = []; }
    }
    const listedUsdc = positions.reduce((s, p) => s + p.amountUsdc, 0);
    const listedDhb = positions.reduce((s, p) => s + p.amountDhb, 0);
    const listedLowest = positions.length ? Math.min(...positions.map((p) => p.marketPrice)) : null;
    const candidates = [pool.lowest, listedLowest].filter((v): v is number => v != null && v > 0);
    const usdPrice = candidates.length ? Math.min(...candidates) : null;
    const result = await call("record_dex_market_sample", {
      p_sample: {
        observedAt: Date.now() / 1000, price: best, positions, blocks,
        usdPrice, liquidityUsd: pool.quoteUsd + listedUsdc, lpDhb: pool.dhbTokens + listedDhb, externalAsks,
        verified,
      },
    });
    return json({ ...result, positions: positions.length, verified: verified.length, failures, ms: Date.now() - started });
  } catch (error) {
    console.error("[dex-market-sample]", error);
    return json({ error: error instanceof Error ? error.message : String(error), ms: Date.now() - started }, 500);
  }
});
