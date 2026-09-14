import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Admin traffic reads
 * ===================
 * Serves the admin panel's Traffic page from `page_view_events`.
 *
 * Why an edge function rather than a query from the panel: the table has RLS
 * on with no policies, so only the service-role key can read it — and this
 * Supabase project is managed by Lovable Cloud, which injects that key into
 * edge functions and never discloses it. No other machine can hold it, so the
 * privileged read lives here. Same shape as `admin-stages`.
 *
 * Auth is the caller's admin bearer token, re-verified against
 * `GET /api/admin/me` rather than decoded locally, so this function holds no
 * secret of its own and a revoked admin stops working here the moment they
 * stop working everywhere else.
 *
 * SUPER_ADMIN only. Traffic across the whole app is a different kind of
 * visibility from moderating one post — it is every route every visitor
 * touched — so it is deliberately not on the READ_ROLES list the other admin
 * functions share.
 *
 * verify_jwt is off (see config.toml): the credential is an admin JWT from
 * api.dehub.io, not a Supabase one.
 */

const ADMIN_API_BASE = Deno.env.get("ADMIN_API_BASE") || "https://api.dehub.io";
const ADMIN_VERIFY_TIMEOUT_MS = 8_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Traffic is super-admin only. Kept as its own list, not a shared one. */
const READ_ROLES = ["SUPER_ADMIN"];

/** The buy surfaces, so the panel does not have to know both spellings. */
const BUY_PATHS = ["/app/buy", "/buy", "/m/dpay"];

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireSuperAdmin(req: Request): Promise<void> {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing authorization token");
  }

  let response: Response;
  try {
    response = await fetch(`${ADMIN_API_BASE}/api/admin/me`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(ADMIN_VERIFY_TIMEOUT_MS),
    });
  } catch (e) {
    // The admin API being unreachable must not read as "you are not an admin",
    // which would bounce the operator to the login screen over a blip.
    throw new HttpError(503, `Could not reach the admin API: ${(e as Error).message}`);
  }

  if (response.status === 401 || response.status === 400) {
    throw new HttpError(401, "Authentication required");
  }
  if (!response.ok) {
    throw new HttpError(503, `Admin API rejected the check (${response.status})`);
  }

  const body = await response.json().catch(() => null);
  const admin = body?.admin;
  if (!admin?._id && !admin?.id) throw new HttpError(401, "Authentication required");
  if (admin.isActive === false) throw new HttpError(403, "This admin account is disabled");
  if (!READ_ROLES.includes(String(admin.role || "").toUpperCase())) {
    throw new HttpError(403, "Traffic is visible to super admins only");
  }
}

/**
 * The service-role key is read per request and never echoed. A PostgREST error
 * is truncated before it goes back, so a failure cannot become a disclosure.
 */
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new HttpError(503, "Traffic reads are not configured on this deployment");

  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpError(502, `Traffic database rejected the request (${response.status}): ${text.slice(0, 200)}`);
  }
  return await response.json();
}

/** `days` is a window, not a cursor: 0 means everything ever recorded. */
function sinceFrom(url: URL): string {
  const days = Number(url.searchParams.get("days") || 30);
  if (!Number.isFinite(days) || days <= 0) return new Date(0).toISOString();
  return new Date(Date.now() - Math.min(3650, days) * 86_400_000).toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireSuperAdmin(req);

    const url = new URL(req.url);
    const p_since = sinceFrom(url);

    // One call serves the whole page: four small aggregates cost less than the
    // four round trips a panel would otherwise make on every window change.
    const [totals, paths, buyTotals, buyDaily, buySources] = await Promise.all([
      rpc("admin_page_view_totals", { p_since }),
      rpc("admin_page_view_paths", { p_since, p_limit: 100 }),
      rpc("admin_page_view_totals", { p_since: new Date(0).toISOString() }),
      rpc("admin_page_view_daily", { p_paths: BUY_PATHS, p_since }),
      rpc("admin_page_view_sources", { p_paths: BUY_PATHS, p_since, p_limit: 25 }),
    ]);

    const allTime = Array.isArray(buyTotals) ? buyTotals[0] : null;
    const windowed = Array.isArray(totals) ? totals[0] : null;

    return json({
      success: true,
      since: p_since,
      buyPaths: BUY_PATHS,
      totals: windowed || { visits: 0, visitors: 0, signed_in_visits: 0 },
      allTime: allTime || { visits: 0, visitors: 0, signed_in_visits: 0 },
      paths: paths || [],
      buyDaily: buyDaily || [],
      buySources: buySources || [],
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ success: false, message: (e as Error).message }, status);
  }
});
