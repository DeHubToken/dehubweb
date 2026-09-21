import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Discovery of every DHB/USDC v4 position, not just the ones minted in the app.
//
// /dex used to list only rows the app wrote to dex_sell_positions, so a range
// order placed on Uniswap's own interface was invisible here even though it
// sits in the same pool and quotes against the same book. Uniswap's
// PositionManager passes the NFT id as the liquidity `salt`, so every position
// in a pool can be recovered from the PoolManager's ModifyLiquidity logs:
// filter by pool id and by PositionManager as sender, read the salt, and that
// is the token id. This function keeps that index current; the minute snapshot
// (dex_private.sample_market) still re-reads the NFT and pool state onchain, so
// nothing written here is trusted as a source of truth about a position.
//
// Backfill walks outward from the chain tip in both directions: forward to the
// head every run, backward until the block the v4 PoolManager was deployed at,
// below which no position can exist. That floor is a constant rather than a
// search: probing historical state to find the pool's first block agrees with
// itself only on an archive node, and a public fallback answers "empty" for
// every block it has pruned, which would park the backfill just behind the tip.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
};

const MODIFY_LIQUIDITY = "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
/** Alchemy serves any range whose result stays under 10k logs; these filters return a handful. */
const MAX_WINDOW = 500_000;
const MIN_WINDOW = 2_000;
/** Leave room inside the 60s cron slot for the write and the response. */
const BUDGET_MS = 40_000;

interface ChainConfig {
  poolManager: string;
  positionManager: string;
  /** Block the v4 PoolManager was deployed at. Nothing older can be a position. */
  floor: number;
  pools: string[];
  rpc: (key: string) => string;
  fallbacks: string[];
}

const CHAINS: Record<number, ChainConfig> = {
  8453: {
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
    floor: 25_350_000,
    pools: [
      "0x9c07d4b06fd20498a3cacb80610b55dbbb7b3d79df07db20caccecc4e65155ec",
      "0xab3b4bd9a7625c641d0c73dbe3e016ae986c6a9e0fb026697c27ef231d360dd0",
    ],
    rpc: (key) => `https://base-mainnet.g.alchemy.com/v2/${key}`,
    fallbacks: ["https://mainnet.base.org"],
  },
  56: {
    poolManager: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
    positionManager: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b",
    floor: 46_000_000,
    pools: [
      "0x64d6da98b6238b7626aa8fd50be27c362079c0103e07d6e2b3ec9eb438c92c98",
      "0xf237a2bbd437c15b6507d720abc4155aacb87591f8a701ef61a1354963d23ea7",
    ],
    rpc: (key) => `https://bnb-mainnet.g.alchemy.com/v2/${key}`,
    fallbacks: [],
  },
};

const hex = (value: number) => "0x" + value.toString(16);

function makeRpc(urls: string[]) {
  return async function rpc(method: string, params: unknown[]): Promise<any> {
    let last: unknown;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json?.error) throw new Error(typeof json.error === "object" ? json.error.message : String(json.error));
        return json.result;
      } catch (error) {
        last = error;
      }
    }
    throw new Error(`${method} failed: ${last instanceof Error ? last.message : String(last)}`);
  };
}

type Rpc = ReturnType<typeof makeRpc>;

interface Found {
  token_id: string;
  mint_tx_hash: string;
  block_number: number;
}

/** Position NFT ids touched inside a block range, each with its earliest sighting. */
async function scanRange(rpc: Rpc, config: ChainConfig, from: number, to: number): Promise<Map<string, Found>> {
  const logs: Array<{ data: string; transactionHash: string; blockNumber: string }> = await rpc("eth_getLogs", [{
    address: config.poolManager,
    fromBlock: hex(from),
    toBlock: hex(to),
    topics: [MODIFY_LIQUIDITY, config.pools, "0x" + config.positionManager.slice(2).padStart(64, "0")],
  }]);
  const found = new Map<string, Found>();
  for (const log of logs) {
    const body = log.data.slice(2);
    if (body.length < 256) continue;
    // ModifyLiquidity data words: tickLower, tickUpper, liquidityDelta, salt.
    const salt = BigInt("0x" + body.slice(192, 256));
    if (salt <= 0n) continue;
    const id = salt.toString();
    const block = parseInt(log.blockNumber, 16);
    const seen = found.get(id);
    if (!seen || block < seen.block_number) {
      found.set(id, { token_id: id, mint_tx_hash: log.transactionHash, block_number: block });
    }
  }
  return found;
}

async function blockTimes(rpc: Rpc, blocks: number[]): Promise<Map<number, string>> {
  const times = new Map<number, string>();
  for (const block of blocks) {
    try {
      const header = await rpc("eth_getBlockByNumber", [hex(block), false]);
      if (header?.timestamp) times.set(block, new Date(Number(BigInt(header.timestamp)) * 1000).toISOString());
    } catch { /* A missing timestamp only costs ordering precision; created_at falls back to now(). */ }
  }
  return times;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = Deno.env.get("ALCHEMY_API_KEY");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const started = Date.now();
  const summary: Record<string, unknown> = {};

  for (const [id, config] of Object.entries(CHAINS)) {
    const chainId = Number(id);
    const urls = [...(key ? [config.rpc(key)] : []), ...config.fallbacks];
    if (!urls.length) { summary[id] = "no rpc configured"; continue; }
    const rpc = makeRpc(urls);
    try {
      const head = parseInt(await rpc("eth_blockNumber", []), 16);
      const { data: cursor } = await supabase.from("dex_pool_scan").select("*").eq("chain_id", chainId).maybeSingle();
      // The endpoint carries the publishable key, so anyone can call it. A scan
      // that just ran has nothing to add and would only burn RPC credits.
      if (cursor && Date.now() - Date.parse(cursor.updated_at) < 30_000) { summary[id] = "throttled"; continue; }

      let low = cursor?.from_block ?? head;
      let high = cursor?.to_block ?? head - 1;
      let window = cursor?.window_blocks ?? MAX_WINDOW;
      const floor = Math.max(1, Math.min(config.floor, low));

      const found = new Map<string, Found>();
      const absorb = (batch: Map<string, Found>) => {
        for (const [tokenId, entry] of batch) {
          const seen = found.get(tokenId);
          if (!seen || entry.block_number < seen.block_number) found.set(tokenId, entry);
        }
      };
      /** One window: "done", "retry" with a smaller range, or "stalled". */
      let stall = "";
      const sweep = async (from: number, to: number): Promise<"done" | "retry" | "stalled"> => {
        try {
          absorb(await scanRange(rpc, config, from, to));
          return "done";
        } catch (error) {
          if (window > MIN_WINDOW) { window = Math.max(MIN_WINDOW, Math.floor(window / 4)); return "retry"; }
          // Whatever has been found so far is still worth writing, and the
          // cursor keeps the next run from starting over.
          stall = error instanceof Error ? error.message : String(error);
          return "stalled";
        }
      };

      // Forward to the tip first: new positions matter more than old ones.
      while (high < head && !stall && Date.now() - started < BUDGET_MS) {
        const from = high + 1;
        const to = Math.min(head, from + window - 1);
        if (await sweep(from, to) === "done") high = to;
      }
      // Then backward, one bounded step at a time, to the PoolManager's first block.
      while (low > floor && !stall && Date.now() - started < BUDGET_MS) {
        const to = low - 1;
        const from = Math.max(floor, to - window + 1);
        if (await sweep(from, to) === "done") low = from;
      }

      if (found.size) {
        const times = await blockTimes(rpc, [...new Set([...found.values()].map((entry) => entry.block_number))]);
        const rows = [...found.values()].map((entry) => ({
          chain_id: chainId,
          token_id: entry.token_id,
          mint_tx_hash: entry.mint_tx_hash,
          block_number: entry.block_number,
          created_at: times.get(entry.block_number) ?? new Date().toISOString(),
        }));
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase.rpc("record_dex_pool_positions", { p_rows: rows.slice(i, i + 200) });
          if (error) throw new Error(error.message);
        }
      }

      const { error } = await supabase.from("dex_pool_scan").upsert({
        chain_id: chainId,
        floor_block: floor,
        from_block: low,
        to_block: high,
        window_blocks: window,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      summary[id] = { found: found.size, from: low, to: high, floor, complete: low <= floor && high >= head, stall: stall || undefined };
    } catch (error) {
      console.error(`[dex-position-scan] chain ${id}`, error);
      summary[id] = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
