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
 * Verify a caller's DeHub identity: GET /api/account_info/{address} with the token
 * as a Bearer credential. api.dehub.io returns 2xx only when the token is valid and
 * bound to that wallet. Network failure is treated as invalid (fail-closed).
 */
export async function validateDeHubToken(token: string, address: string): Promise<boolean> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${address}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type AuthResult =
  | { ok: true; wallet: string; token: string }
  | { ok: false; response: Response };

/**
 * Require a valid DeHub token + wallet on the request. On success returns the
 * lowercased wallet address; on failure returns a ready-to-send 401 response.
 */
export async function requireDeHubAuth(req: Request): Promise<AuthResult> {
  const wallet = req.headers.get("x-wallet-address")?.toLowerCase() || "";
  const token = req.headers.get("x-dehub-token") || "";
  if (!wallet || !token) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "Authentication required: x-wallet-address and x-dehub-token headers." },
        401,
      ),
    };
  }
  if (!(await validateDeHubToken(token, wallet))) {
    return { ok: false, response: jsonResponse({ error: "Invalid or expired DeHub token." }, 401) };
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
