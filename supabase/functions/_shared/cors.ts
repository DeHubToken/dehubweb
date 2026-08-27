// The one CORS allow-list for DeHub's edge functions.
//
// Split out of _shared/auth.ts so a function can have the canonical headers
// without also pulling in supabase-js and the api.dehub.io verifier — that
// weight is why so many functions hand-rolled a local copy instead, and every
// copy has eventually drifted from what the client actually sends.
//
// Why drift here is expensive: a request header that is missing from the
// preflight response makes the BROWSER refuse to send the request. There is no
// network entry, no function log, and the failure is indistinguishable from
// the server being down. It has cost this repo three separate outages — the
// paid AI functions (#337), the DELETE/PATCH surfaces, and in August 2026 the
// `x-supabase-client-platform` family, which supabase-js began attaching to
// every invoke and which 62 of 115 deployed functions did not list.
//
// scripts/edge-cors-check.mjs fails CI on any list that falls behind.
//
// Listing a header or a method grants nothing on its own: each function still
// reads what it wants and 405s the methods it does not handle. So the list is
// deliberately a superset — the cost of an unused entry is zero, and the cost
// of a missing one is a feature that is silently unreachable.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

/** Returns a preflight response for OPTIONS requests, or null to continue. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
