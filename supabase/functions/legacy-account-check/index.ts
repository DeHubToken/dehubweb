/**
 * legacy-account-check
 * ====================
 * Tells the wallet-create step whether the CURRENT user's verified email
 * belongs to pre-migration (Web3Auth-era) DeHub account(s), so the UI can
 * auto-select the Migrate tab and preview what's known about them, instead
 * of the user blind-guessing which old login to use.
 *
 * A person can have MORE than one old account for the same email: Supabase
 * links Google/Email logins that share a verified email into ONE new
 * identity, but on the old system each login method could be its own
 * separate account with its own balance/profile. This returns ALL matches.
 *
 * Security model:
 * - verify_jwt = true (config.toml): only authenticated Supabase users reach
 *   this function at all.
 * - The email is resolved SERVER-SIDE from the caller's JWT — it is never a
 *   request parameter, so this cannot be used to enumerate other people's
 *   accounts.
 *
 * Data source: public.legacy_accounts — a ONE-TIME, static import of the old
 * MongoDB backend's accounts (email -> signup method + wallet address +
 * username + badge balance). Old accounts don't change going forward
 * (Web3Auth is being retired), so this is a snapshot, not a live sync.
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

    const { data, error } = await admin
      .from('legacy_accounts')
      .select('signup_method, eth_address, username, badge_balance')
      .ilike('email', email);

    if (error) {
      console.error('[legacy-account-check] Query error:', error);
      return json({ exists: null, reason: 'query-error' });
    }
    if (!data || data.length === 0) {
      return json({ exists: false, email });
    }

    return json({
      exists: true,
      email,
      accounts: data.map((row) => ({
        signupMethod: row.signup_method ?? undefined,
        ethAddress: row.eth_address,
        username: row.username ?? undefined,
        badgeBalance: row.badge_balance ?? undefined,
      })),
    });
  } catch (error: unknown) {
    console.error('[legacy-account-check] Error:', error);
    return json({ exists: null, reason: 'error' });
  }
});
