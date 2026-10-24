// Relays the smart wallet's bundler and paymaster calls to Pimlico.
//
// get-pimlico-config used to hand every visitor `api.pimlico.io/...?apikey=`,
// so the key sat in sessionStorage and in any network log, and anyone who read
// it could spend DeHub's gas sponsorship on any account on any chain Pimlico
// serves. The clients now get a URL pointing here instead, in the same
// `/v2/{chainId}/rpc` shape, so both apps' per-chain rewrite keeps working and
// the key never leaves the server.
//
// Only what a Safe smart account needs is passed through: the ERC-4337
// bundler methods, Pimlico's own namespace (the gas price quote) and the
// paymaster namespace, on the chains the apps actually set up. Sponsorship
// calls are rate limited per IP, because those are the ones that cost money.
import { corsHeaders, jsonResponse, rateLimitByIp } from "../_shared/auth.ts";

// Base, BNB, Ethereum, Robinhood Chain, Arc — AA_CHAIN_CONFIGS on web,
// libs/wallet-core/smart-account.ts on mobile.
const CHAINS = new Set([8453, 56, 1, 4663, 5042]);

const BUNDLER_METHODS = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
]);

const SPONSOR_LIMIT = { limit: 300, windowMs: 60 * 60 * 1000 };

type RpcCall = { id?: unknown; method?: unknown };

function allowed(method: unknown): boolean {
  return typeof method === "string" &&
    (BUNDLER_METHODS.has(method) || method.startsWith("pimlico_") || method.startsWith("pm_"));
}

function rpcError(id: unknown, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST a JSON-RPC request" }, 405);

  const apiKey = Deno.env.get("PIMLICO_API_KEY");
  if (!apiKey) return jsonResponse({ error: "Pimlico API key not configured" }, 500);

  const chainId = Number(new URL(req.url).pathname.match(/\/(\d+)\/rpc\/?$/)?.[1]);
  if (!CHAINS.has(chainId)) return jsonResponse({ error: "Unsupported chain" }, 404);

  let body: RpcCall | RpcCall[];
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcError(null, "Invalid JSON"), 400);
  }

  const calls = Array.isArray(body) ? body : [body];
  const refused = calls.find((call) => !allowed(call?.method));
  if (refused) {
    console.warn(`[pimlico-rpc] refused ${String(refused?.method)} on ${chainId}`);
    return jsonResponse(rpcError(refused?.id, "Method not available"), 400);
  }

  if (calls.some((call) => String(call.method).startsWith("pm_"))) {
    const limited = await rateLimitByIp(req, "pimlico_sponsor", SPONSOR_LIMIT);
    if (limited) return limited;
  }

  const upstream = await fetch(`https://api.pimlico.io/v2/${chainId}/rpc?apikey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!upstream) return jsonResponse(rpcError(calls[0]?.id, "Bundler unreachable"), 502);

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
