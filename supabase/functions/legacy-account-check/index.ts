/**
 * legacy-account-check
 * ====================
 * Tells the wallet-create step whether the CURRENT user's verified email
 * belongs to a pre-migration (Web3Auth-era) DeHub account, so the UI can
 * auto-select the Migrate tab instead of letting them create a fresh wallet.
 *
 * Security model:
 * - verify_jwt = true (config.toml): only authenticated Supabase users reach
 *   this function at all.
 * - The email is resolved SERVER-SIDE from the caller's JWT — it is never a
 *   request parameter, so this cannot be used to enumerate other people's
 *   accounts.
 * - The upstream lookup on api.dehub.io is gated by a shared secret
 *   (DEHUB_INTERNAL_SECRET) so only this function can call it.
 *
 * Graceful degradation: any missing config / upstream failure returns
 * { exists: null } — the client treats that as "unknown" and behaves as
 * before. Deploying this function before the backend endpoint exists is safe.
 *
 * ── Required NestJS endpoint on api.dehub.io (to be added) ─────────────────
 *   GET /api/internal/legacy-account?email=<lowercased email>
 *   Header: x-internal-secret: <DEHUB_INTERNAL_SECRET>   (401 otherwise)
 *   200 → { "exists": boolean, "signupMethod"?: "google" | "apple" |
 *           "twitter" | "discord" | "email" | "wallet" | "github" }
 *   The user collection already stores email + signupMethod (the admin
 *   users list filters on both), so this is an indexed findOne on email.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Resolve the caller's verified email from their JWT (verify_jwt already
    // rejected anonymous calls; this recovers WHO is calling).
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ exists: null, reason: 'no-auth' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    const email = userData?.user?.email?.trim().toLowerCase();
    if (userError || !email) {
      // Phone-only identities etc. — nothing to look up.
      return json({ exists: null, reason: 'no-email' });
    }

    const secret = Deno.env.get('DEHUB_INTERNAL_SECRET');
    if (!secret) {
      // Backend lookup not wired up yet — report "unknown", never guess.
      return json({ exists: null, reason: 'not-configured' });
    }

    const apiBase = Deno.env.get('DEHUB_API_BASE') || 'https://api.dehub.io';
    const upstream = await fetch(
      `${apiBase}/api/internal/legacy-account?email=${encodeURIComponent(email)}`,
      {
        headers: { 'x-internal-secret': secret, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!upstream.ok) {
      console.warn('[legacy-account-check] upstream status', upstream.status);
      return json({ exists: null, reason: `upstream-${upstream.status}` });
    }

    const body = await upstream.json().catch(() => null);
    if (!body || typeof body.exists !== 'boolean') {
      return json({ exists: null, reason: 'bad-upstream' });
    }

    return json({
      exists: body.exists,
      signupMethod: typeof body.signupMethod === 'string' ? body.signupMethod : null,
      email,
    });
  } catch (error: unknown) {
    console.error('[legacy-account-check] Error:', error);
    return json({ exists: null, reason: 'error' });
  }
});
