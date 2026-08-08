// Shared authentication + rate-limiting helpers for DeHub edge functions.
//
// DeHub has no Supabase-auth users — identity is wallet-native (Web3Auth). A caller
// proves identity by presenting the DeHub API token it received at login, together
// with its wallet address; we verify the pair against api.dehub.io. Paid/abusable
// endpoints should gate on requireDeHubAuth() and, where relevant, checkRateLimit().
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEHUB_API_BASE = "https://api.dehub.io";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Returns a preflight response for OPTIONS requests, or null to continue. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Resolve the address a token actually belongs to, or null.
 *
 * This used to fetch `GET /account_info/{address}` and treat a 200 as proof
 * the token was good. That route is a public profile endpoint with no guard —
 * it answers 200 for any token, any address, and for no Authorization header
 * at all — so the check always passed. Combined with taking the wallet from
 * the caller's own `x-wallet-address` header, it meant any caller could act as
 * any address they knew, and addresses are public.
 *
 * `/auth/verify` is guarded and returns the address off the verified token, so
 * callers can stop believing the header.
 */
export async function resolveDeHubAddress(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const address = typeof data?.address === "string" ? data.address.toLowerCase() : "";
    return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
  } catch {
    // Fail closed: an unreachable auth service must not authenticate anyone.
    return null;
  }
}

export type AuthResult =
  | { ok: true; wallet: string; token: string }
  | { ok: false; response: Response };

/**
 * Require a valid DeHub token. On success returns the wallet the token
 * actually belongs to; on failure a ready-to-send 401.
 *
 * The returned wallet comes from the verified token, NOT from the
 * x-wallet-address header. That header is still read, but only to detect a
 * mismatch — anything keyed on identity (spending a balance, reading private
 * data) must use `wallet` from this result. Trusting the header is what let
 * one account spend another's credit.
 */
export async function requireDeHubAuth(req: Request): Promise<AuthResult> {
  const token = req.headers.get("x-dehub-token") || "";
  if (!token) {
    return {
      ok: false,
      response: jsonResponse({ error: "Authentication required: x-dehub-token header." }, 401),
    };
  }

  const wallet = await resolveDeHubAddress(token);
  if (!wallet) {
    return { ok: false, response: jsonResponse({ error: "Invalid or expired DeHub token." }, 401) };
  }

  // A claimed address that disagrees with the token is either a stale client
  // or someone probing. Refuse rather than quietly acting as the real owner,
  // so the caller cannot discover whose token they are holding.
  const claimed = req.headers.get("x-wallet-address")?.toLowerCase();
  if (claimed && claimed !== wallet) {
    return {
      ok: false,
      response: jsonResponse({ error: "Token does not belong to the supplied wallet." }, 403),
    };
  }

  return { ok: true, wallet, token };
}

/** Service-role client (bypasses RLS) for edge-function bookkeeping such as rate limits. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Best-effort client IP for rate-limiting anonymous endpoints. */
export function callerIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

export interface RateLimit {
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window rate limit keyed on (bucketKey, actionType) in public.edge_rate_limits.
 * Fails OPEN on any DB error — bookkeeping must never take a working feature down.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  bucketKey: string,
  actionType: string,
  cfg: RateLimit,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - cfg.windowMs);
  try {
    const { data } = await supabase
      .from("edge_rate_limits")
      .select("count, window_start")
      .eq("bucket_key", bucketKey)
      .eq("action_type", actionType)
      .maybeSingle();

    if (!data || new Date(data.window_start) < cutoff) {
      await supabase.from("edge_rate_limits").upsert({
        bucket_key: bucketKey,
        action_type: actionType,
        count: 1,
        window_start: now.toISOString(),
      });
      return { allowed: true, remaining: cfg.limit - 1, resetAt: new Date(now.getTime() + cfg.windowMs) };
    }

    const resetAt = new Date(new Date(data.window_start).getTime() + cfg.windowMs);
    if (data.count >= cfg.limit) return { allowed: false, remaining: 0, resetAt };

    await supabase
      .from("edge_rate_limits")
      .update({ count: data.count + 1 })
      .eq("bucket_key", bucketKey)
      .eq("action_type", actionType);
    return { allowed: true, remaining: cfg.limit - data.count - 1, resetAt };
  } catch {
    return { allowed: true, remaining: cfg.limit, resetAt: new Date(now.getTime() + cfg.windowMs) };
  }
}

/**
 * Per-IP rate limit for endpoints that must stay reachable without login (public or
 * paid endpoints the client invokes with only the anon key). Returns a ready 429
 * response when over the limit, or null to continue. Fails OPEN on any DB error.
 */
export async function rateLimitByIp(
  req: Request,
  actionType: string,
  cfg: RateLimit,
): Promise<Response | null> {
  const rl = await checkRateLimit(serviceClient(), `ip:${callerIp(req)}`, actionType, cfg);
  if (!rl.allowed) {
    return jsonResponse(
      { error: `Rate limit exceeded for this endpoint. Try again after ${rl.resetAt.toISOString()}.` },
      429,
    );
  }
  return null;
}

/**
 * One-shot guard for paid/abusable endpoints: require a valid DeHub token, then
 * enforce a per-wallet rate limit. Returns the wallet on success, or a 401/429 response.
 */
export async function guardPaidEndpoint(
  req: Request,
  actionType: string,
  cfg: RateLimit,
): Promise<{ ok: true; wallet: string } | { ok: false; response: Response }> {
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth;

  const rl = await checkRateLimit(serviceClient(), auth.wallet, actionType, cfg);
  if (!rl.allowed) {
    return {
      ok: false,
      response: jsonResponse(
        { error: `Rate limit exceeded. Try again after ${rl.resetAt.toISOString()}.` },
        429,
      ),
    };
  }
  return { ok: true, wallet: auth.wallet };
}
