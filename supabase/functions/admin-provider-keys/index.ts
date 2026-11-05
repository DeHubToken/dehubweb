/**
 * admin-provider-keys
 * ===================
 * The admin hub's "Own keys" card: how many creators run tools on their own
 * AI provider keys, which keys are failing, and a switch to turn one off.
 *
 * GET
 *   → { providers: [{ id, label, working, invalid, noCredit, disabled }],
 *       keys: [{ wallet, provider, last4, status, checkedAt, lastUsedAt, createdAt }] }
 * POST { action: 'disable' | 'enable', wallet, provider }
 *   'disable' stops the key being used (the creator sees "Turned off by Riftn"
 *   and cannot re-save it). 'enable' hands it back as working.
 *
 * No key material is ever read here: only the last 4 characters the table
 * already keeps. Callers are checked against api.dehub.io /api/admin/me.
 */

import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';
import { serviceClient } from '../_shared/auth.ts';
import { BYOK_PROVIDERS, byokProvider } from '../_shared/byok.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);
const ROW_LIMIT = 500;

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/me`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const admin = json?.admin ?? json?.data?.admin ?? json;
    if (admin?.isActive === false) return false;
    return ADMIN_ROLES.has(String(admin?.role ?? '').toUpperCase());
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: adsCorsHeaders });
  if (!(await isAdmin(req.headers.get('Authorization')))) return jsonResponse({ error: 'unauthorized' }, 401);
  const db = serviceClient();

  if (req.method === 'GET') {
    const { data, error } = await db.from('user_provider_keys')
      .select('wallet_address, provider, last4, status, checked_at, last_used_at, created_at')
      .order('updated_at', { ascending: false }).limit(ROW_LIMIT);
    if (error) return jsonResponse({ error: 'Could not load keys.' }, 503);
    const rows = data ?? [];
    const providers = Object.values(BYOK_PROVIDERS).map(p => {
      const mine = rows.filter(r => r.provider === p.id);
      const count = (status: string) => mine.filter(r => r.status === status).length;
      return { id: p.id, label: p.label, working: count('working'), invalid: count('invalid'), noCredit: count('no_credit'), disabled: count('disabled') };
    });
    return jsonResponse({
      providers,
      keys: rows.map(r => ({
        wallet: r.wallet_address, provider: r.provider, last4: r.last4, status: r.status,
        checkedAt: r.checked_at, lastUsedAt: r.last_used_at, createdAt: r.created_at,
      })),
    });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const provider = byokProvider(body.provider);
  const wallet = typeof body.wallet === 'string' ? body.wallet.toLowerCase() : '';
  if (!provider || !/^0x[a-f0-9]{40}$/.test(wallet)) return jsonResponse({ error: 'wallet and provider are required' }, 400);
  if (body.action !== 'disable' && body.action !== 'enable') return jsonResponse({ error: 'Unknown action' }, 400);

  const { data, error } = await db.from('user_provider_keys')
    .update({ status: body.action === 'disable' ? 'disabled' : 'working', checked_at: new Date().toISOString() })
    .eq('wallet_address', wallet).eq('provider', provider.id).select('status').maybeSingle();
  if (error) return jsonResponse({ error: 'Could not update the key.' }, 503);
  if (!data) return jsonResponse({ error: 'No key saved for that wallet and provider.' }, 404);
  console.log('[admin-provider-keys]', body.action, provider.id, wallet.slice(0, 8));
  return jsonResponse({ ok: true, status: data.status });
});
