/**
 * legacy-account-check (retired)
 * ==============================
 * This used to look the caller's email up in public.legacy_accounts, a
 * one-time snapshot of the Web3Auth-era accounts, so the wallet-create step
 * could offer to bring an old account over. An email match is not proof of
 * whose account it is, and the migration route it fed has been removed from
 * the app. Old accounts that were never moved over are handled by support.
 *
 * It stays deployed because builds already on people's devices still call it
 * during sign-up. The answer is always `{ exists: false }`, which lets those
 * builds go straight on to a new account. It must never answer
 * `exists: null`: they read that as "could not check" and stop on the old
 * migrate screen instead.
 *
 * Nothing is read and nothing about anyone is returned, so the answer is the
 * same for every caller. It still requires a signed-in user: verify_jwt = true
 * (config.toml) rejects a missing or invalid token before this code runs, and
 * the anon key is turned away below.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * True when the bearer token is a signed-in user's session rather than the
 * anon key. Only the claims are read: the platform has already checked the
 * signature and expiry (verify_jwt), and no lookup here can fail for a real
 * user, which an older build would treat as blocking.
 */
function isSignedInUser(jwt: string): boolean {
  const payload = jwt.split('.')[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims?.role === 'authenticated' && typeof claims?.sub === 'string' && claims.sub.length > 0;
  } catch {
    return false;
  }
}

serve((req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!isSignedInUser(jwt)) return json({ error: 'Authentication required' }, 401);

  return json({ exists: false });
});
