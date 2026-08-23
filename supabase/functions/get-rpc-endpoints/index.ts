import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime-version, x-supabase-client-runtime',
};

// The URLs this endpoint returns embed the paid Alchemy key. Any browser the
// app ships to sees them anyway, but an unguarded endpoint let scripts harvest
// the key at scale and burn Alchemy compute units directly. Two cheap brakes:
// same-origin checks for anything that looks like a browser, and a tight
// per-IP rate limit — legitimate clients cache the answer in sessionStorage,
// so one call per session is all real traffic ever needs.
//
// Native apps and server-side callers send no Origin/Referer; they pass the
// origin check and are bounded by the rate limit alone.
const ALLOWED_ORIGINS = new Set(
  [
    "https://dehub.io",
    "https://www.dehub.io",
    "https://staging.dehub.io",
    ...(Deno.env.get("RPC_ALLOWED_ORIGINS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
);

function isLocalOrigin(value: string): boolean {
  return (
    /^https?:\/\/localhost(:\d+)?$/i.test(value) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(value) ||
    /^capacitor:\/\/localhost$/i.test(value)
  );
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  if (origin) return ALLOWED_ORIGINS.has(origin) || isLocalOrigin(origin);
  const referer = req.headers.get("referer") || "";
  if (!referer) return true;
  try {
    const host = new URL(referer).origin;
    return ALLOWED_ORIGINS.has(host) || isLocalOrigin(host);
  } catch {
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!originAllowed(req)) {
    return new Response(
      JSON.stringify({ error: 'Not allowed' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const limited = await rateLimitByIp(req, 'get-rpc-endpoints', { limit: 6, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  try {
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');

    if (!alchemyKey) {
      console.error('[RPC Endpoints] ALCHEMY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'RPC configuration not available' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        base: `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        bsc: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[RPC Endpoints] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
