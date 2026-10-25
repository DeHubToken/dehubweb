// Verified total reach: follower counts read from the social accounts a
// creator connected through Zernio (the same connection multi-posting uses),
// never typed by the creator.
//
// `get` is public and takes any wallet; it serves social_reach_cache and
// refreshes it from Zernio once it is older than CACHE_MS. `sync` is the
// owner's own refresh, called right after connecting or disconnecting an
// account so the new number shows without waiting out the cache.

import { handleCorsPreflight, jsonResponse, rateLimitByIp, requireDeHubAuth, serviceClient } from '../_shared/auth.ts';
import { zernio } from '../_shared/zernio.ts';

// Zernio refreshes follower counts once a day; a few hours keeps profile
// views off its API without leaving a fresh connection blank for long.
const CACHE_MS = 6 * 60 * 60 * 1000;

// Platforms a profile can show a link for, and so a count beside.
const REACH_PLATFORMS = new Set(['twitter', 'instagram', 'tiktok', 'youtube', 'discord', 'facebook']);

interface ReachAccount {
  platform: string;
  username: string;
  profileUrl: string | null;
  followers: number | null;
  followersUpdatedAt: string | null;
}

type Admin = ReturnType<typeof serviceClient>;

async function readFromZernio(admin: Admin, wallet: string): Promise<ReachAccount[]> {
  const { data } = await admin.from('social_profiles').select('zernio_profile_id').eq('wallet_address', wallet).maybeSingle();
  const profileId = data?.zernio_profile_id;
  if (!profileId) return [];
  const res = await zernio(`/accounts?profileId=${encodeURIComponent(profileId)}`);
  if (res.status >= 400) throw new Error(res.data?.error || `Zernio ${res.status}`);
  const accounts: any[] = res.data?.accounts ?? [];
  const out: ReachAccount[] = [];
  for (const a of accounts) {
    if (a?.isActive === false || a?.needsReconnection) continue;
    if (!REACH_PLATFORMS.has(a?.platform)) continue;
    // A platform shows once on a profile; keep its largest account.
    const followers = Number.isFinite(Number(a.followersCount)) && Number(a.followersCount) >= 0
      ? Math.floor(Number(a.followersCount))
      : null;
    const entry: ReachAccount = {
      platform: a.platform,
      username: String(a.username ?? a.displayName ?? ''),
      profileUrl: typeof a.profileUrl === 'string' ? a.profileUrl : null,
      followers,
      followersUpdatedAt: typeof a.followersLastUpdated === 'string' ? a.followersLastUpdated : null,
    };
    const existing = out.findIndex((e) => e.platform === entry.platform);
    if (existing === -1) out.push(entry);
    else if ((entry.followers ?? -1) > (out[existing].followers ?? -1)) out[existing] = entry;
  }
  return out;
}

async function refresh(admin: Admin, wallet: string): Promise<{ accounts: ReachAccount[]; syncedAt: string }> {
  const accounts = await readFromZernio(admin, wallet);
  const syncedAt = new Date().toISOString();
  await admin.from('social_reach_cache').upsert({ wallet_address: wallet, accounts, synced_at: syncedAt });
  return { accounts, syncedAt };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? 'get');
  const admin = serviceClient();

  try {
    if (action === 'get') {
      const wallet = String(body?.wallet ?? '').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) return jsonResponse({ error: 'Invalid wallet' }, 400);
      const { data: cached } = await admin.from('social_reach_cache').select('accounts, synced_at').eq('wallet_address', wallet).maybeSingle();
      if (cached && Date.now() - new Date(cached.synced_at).getTime() < CACHE_MS) {
        return jsonResponse({ accounts: cached.accounts ?? [], syncedAt: cached.synced_at });
      }
      const limited = await rateLimitByIp(req, 'social-reach-refresh', { limit: 120, windowMs: 60_000 });
      if (limited) return jsonResponse({ accounts: cached?.accounts ?? [], syncedAt: cached?.synced_at ?? null });
      try {
        return jsonResponse(await refresh(admin, wallet));
      } catch {
        // Zernio down or unconfigured: the last known numbers beat none.
        return jsonResponse({ accounts: cached?.accounts ?? [], syncedAt: cached?.synced_at ?? null });
      }
    }

    if (action === 'sync') {
      const auth = await requireDeHubAuth(req);
      if (!auth.ok) return auth.response;
      return jsonResponse(await refresh(admin, auth.wallet));
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Could not read social reach.' }, 500);
  }
});
