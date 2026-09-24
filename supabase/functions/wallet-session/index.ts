// Mints the signed wallet session that row-level security trusts.
//
// The wallet comes from the verified DeHub token, never from the request, so a
// session can only ever be issued to the wallet that is actually signed in.
// Clients send the result as x-wallet-session on every REST and storage call;
// see get_request_wallet_address() in 20260925090000_wallet_sessions.sql.
import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from '../_shared/auth.ts';

const TTL_SECONDS = 12 * 60 * 60;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const db = serviceClient();
  const limited = await checkRateLimit(db, auth.wallet, 'wallet-session', { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) return jsonResponse({ error: 'Too many session requests. Try again later.' }, 429);
  const body = await req.json().catch(() => ({}));
  const client = typeof body.client === 'string' ? body.client.slice(0, 20) : null;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 40) : null;
  const { data, error } = await db.rpc('issue_wallet_session', {
    p_wallet: auth.wallet,
    p_ttl_seconds: TTL_SECONDS,
    p_client: client,
    p_app_version: appVersion,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.token) {
    console.error('[wallet-session]', error?.message);
    return jsonResponse({ error: 'Could not start a session.' }, 503);
  }
  return jsonResponse({ wallet: auth.wallet.toLowerCase(), token: row.token, expiresAt: row.expires_at });
});
