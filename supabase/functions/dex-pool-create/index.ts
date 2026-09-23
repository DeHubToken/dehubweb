// Open a community pool on /dex, once the $100 listing fee is on chain.
//
// `{ check: true, chain, tokenAddress }` only looks the token up: it reads the
// token's own contract (or mint) for decimals and naming, says whether a pool
// already exists, and quotes the fee in DHB. Nothing is written.
//
// `{ chain, tokenAddress, txHash, imageUrl? }` opens the pool. The wallet comes
// from the verified DeHub token, the fee transfer is confirmed and claimed by
// `claimDhbPayment`, and the hash is stored on the row — `dex_pools.fee_tx_hash`
// is unique, so one transfer opens exactly one pool. Token details are always
// read here, never taken from the request.

import { handleCorsPreflight, jsonResponse, guardPaidEndpoint, serviceClient } from "../_shared/auth.ts";
import { claimDhbPayment } from "../_shared/dhb-transfer.ts";

const FEE_USD = 100;
/** The DHB price can move between the quote and the transfer landing. */
const PRICE_TOLERANCE = 0.95;

type Chain = "base" | "ethereum" | "robinhood" | "solana";
const CHAINS: Chain[] = ["base", "ethereum", "robinhood", "solana"];
const DEXSCREENER_SLUG: Record<Chain, string> = {
  base: "base", ethereum: "ethereum", robinhood: "robinhood", solana: "solana",
};

function evmRpc(chain: Exclude<Chain, "solana">): string[] {
  const key = Deno.env.get("ALCHEMY_API_KEY");
  if (chain === "base") return [...(key ? [`https://base-mainnet.g.alchemy.com/v2/${key}`] : []), "https://base-rpc.publicnode.com"];
  if (chain === "ethereum") return [...(key ? [`https://eth-mainnet.g.alchemy.com/v2/${key}`] : []), "https://ethereum-rpc.publicnode.com"];
  return ["https://rpc.mainnet.chain.robinhood.com"];
}
const SOLANA_RPC = Deno.env.get("SOLANA_RPC_URL") || "https://solana-rpc.publicnode.com";

async function rpc(urls: string[], method: string, params: unknown[]): Promise<unknown> {
  let last: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json();
      if (json.error) { last = json.error; continue; }
      return json.result;
    } catch (error) { last = error; }
  }
  throw new Error(`RPC ${method} failed: ${String((last as { message?: string })?.message ?? last)}`);
}

/** An ABI `string` return, or a legacy `bytes32` one (MKR and friends). */
function decodeString(hex: string): string {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!data) return "";
  const bytes = (h: string) => new Uint8Array(h.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  const clean = (s: string) => s.replace(/\0/g, "").trim();
  if (data.length === 64) return clean(new TextDecoder().decode(bytes(data)));
  const length = parseInt(data.slice(64, 128), 16);
  if (!Number.isFinite(length) || length > 256) return "";
  return clean(new TextDecoder().decode(bytes(data.slice(128, 128 + length * 2))));
}

interface TokenInfo { symbol: string; name: string; decimals: number; imageUrl: string | null; priceUsd: number | null }

async function dexscreener(chain: Chain, address: string): Promise<{ symbol?: string; name?: string; imageUrl?: string; priceUsd?: number }> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${DEXSCREENER_SLUG[chain]}/${address}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return {};
    const pairs = await res.json();
    if (!Array.isArray(pairs) || !pairs.length) return {};
    const best = [...pairs].sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0))[0];
    const side = String(best?.baseToken?.address ?? "").toLowerCase() === address.toLowerCase() ? best.baseToken : best.quoteToken;
    return {
      symbol: side?.symbol, name: side?.name,
      imageUrl: typeof best?.info?.imageUrl === "string" ? best.info.imageUrl : undefined,
      priceUsd: side === best.baseToken && Number(best.priceUsd) > 0 ? Number(best.priceUsd) : undefined,
    };
  } catch { return {}; }
}

async function readToken(chain: Chain, address: string): Promise<TokenInfo | null> {
  const listed = await dexscreener(chain, address);
  if (chain === "solana") {
    const account = await rpc([SOLANA_RPC], "getAccountInfo", [address, { encoding: "jsonParsed" }]) as
      { value?: { data?: { parsed?: { type?: string; info?: { decimals?: number } } } } } | null;
    const parsed = account?.value?.data?.parsed;
    if (parsed?.type !== "mint" || typeof parsed.info?.decimals !== "number") return null;
    const symbol = (listed.symbol || address.slice(0, 4)).slice(0, 32);
    return { symbol, name: (listed.name || symbol).slice(0, 80), decimals: parsed.info.decimals,
      imageUrl: listed.imageUrl ?? null, priceUsd: listed.priceUsd ?? null };
  }
  const urls = evmRpc(chain);
  const call = (data: string) => rpc(urls, "eth_call", [{ to: address, data }, "latest"]) as Promise<string>;
  const code = await rpc(urls, "eth_getCode", [address, "latest"]) as string;
  if (!code || code === "0x") return null;
  const [decimalsHex, symbolHex, nameHex] = await Promise.all([
    call("0x313ce567"), call("0x95d89b41").catch(() => "0x"), call("0x06fdde03").catch(() => "0x"),
  ]);
  const decimals = parseInt(decimalsHex, 16);
  if (!Number.isFinite(decimals) || decimals > 36) return null;
  const symbol = (decodeString(symbolHex) || listed.symbol || "TOKEN").slice(0, 32);
  return { symbol, name: (decodeString(nameHex) || listed.name || symbol).slice(0, 80), decimals,
    imageUrl: listed.imageUrl ?? null, priceUsd: listed.priceUsd ?? null };
}

function normaliseAddress(chain: Chain, raw: string): string | null {
  const value = raw.trim();
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null;
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
}

async function dhbUsdPrice(admin: ReturnType<typeof serviceClient>): Promise<number | null> {
  const { data, error } = await admin.rpc("get_dex_market");
  if (error) return null;
  const price = Number((data as { usdPrice?: unknown } | null)?.usdPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let body: { check?: unknown; chain?: unknown; tokenAddress?: unknown; txHash?: unknown; imageUrl?: unknown };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request body." }, 400); }

  const chain = CHAINS.find((c) => c === body.chain);
  if (!chain) return jsonResponse({ error: "Choose Base, Ethereum, Robinhood Chain or Solana." }, 400);
  const tokenAddress = typeof body.tokenAddress === "string" ? normaliseAddress(chain, body.tokenAddress) : null;
  if (!tokenAddress) return jsonResponse({ error: "That is not a valid token address for this network." }, 400);

  const admin = serviceClient();
  const { data: existing } = await admin.from("dex_pools").select("*").eq("chain", chain).eq("token_address", tokenAddress).maybeSingle();

  if (body.check === true) {
    if (existing) return jsonResponse({ exists: true, pool: existing });
    let token: TokenInfo | null;
    try { token = await readToken(chain, tokenAddress); } catch { return jsonResponse({ error: "Could not read that token right now. Try again." }, 502); }
    if (!token) return jsonResponse({ error: "No token was found at that address on this network." }, 404);
    const dhbUsd = await dhbUsdPrice(admin);
    return jsonResponse({ exists: false, token, feeUsd: FEE_USD, feeDhb: dhbUsd ? Math.ceil(FEE_USD / dhbUsd) : null, dhbUsd });
  }

  const auth = await guardPaidEndpoint(req, "dex-pool-create", { limit: 20, windowMs: 24 * 60 * 60 * 1000 });
  if (!auth.ok) return auth.response;
  // Refuse before claiming, so a second payer for the same token keeps their transfer.
  if (existing) return jsonResponse({ error: "A pool for this token is already open.", pool: existing }, 409);

  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" && /^https:\/\/\S{1,1000}$/.test(body.imageUrl.trim()) ? body.imageUrl.trim() : null;

  let token: TokenInfo | null;
  try { token = await readToken(chain, tokenAddress); } catch { return jsonResponse({ error: "Could not read that token right now. Your fee is safe; retry." }, 502); }
  if (!token) return jsonResponse({ error: "No token was found at that address on this network." }, 404);

  const dhbUsd = await dhbUsdPrice(admin);
  if (!dhbUsd) return jsonResponse({ error: "The DHB price is unavailable right now. Your fee is safe; retry." }, 503);
  const minimumDhb = Math.floor(FEE_USD / dhbUsd * PRICE_TOLERANCE);

  const payment = await claimDhbPayment(txHash, auth.wallet, minimumDhb, "dex-pool", admin);
  if (!payment.ok) return jsonResponse({ error: payment.reason }, 402);

  const { data, error } = await admin.from("dex_pools").insert({
    chain, token_address: tokenAddress, symbol: token.symbol, name: token.name, decimals: token.decimals,
    image_url: imageUrl ?? token.imageUrl, creator_address: auth.wallet, fee_tx_hash: payment.hash.toLowerCase(),
    fee_dhb: payment.dhb, fee_usd: Math.round(payment.dhb * dhbUsd * 100) / 100,
  }).select().single();

  if (error) {
    // Same transfer presented twice: hand back the pool it already opened.
    const { data: paid } = await admin.from("dex_pools").select("*").eq("fee_tx_hash", payment.hash.toLowerCase()).maybeSingle();
    if (paid) return jsonResponse({ pool: paid });
    console.error("[dex-pool-create] insert failed", error.message);
    return jsonResponse({ error: "The fee was received but the pool could not be saved. Retry with the same transfer." }, 500);
  }
  return jsonResponse({ pool: data });
});
