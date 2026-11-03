/**
 * provider-keys
 * =============
 * Creators' own AI provider keys, for Settings > Creator tools > Your own AI keys.
 *
 * GET
 *   → { providers: [{ id, label, powers, keysUrl, saved?: { last4, status, checkedAt, lastUsedAt } }] }
 * POST { action: 'save', provider, key }
 *   One free test call to the provider first. A rejected key is not saved.
 *   → { ok: true, last4, status }  |  { error, code }
 * POST { action: 'test', provider }      re-checks the saved key
 * POST { action: 'remove', provider }    deletes the key for real
 *
 * The full key is never returned, logged or echoed back after it is sent.
 */

import { guardPaidEndpoint, handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';
import { BYOK_PROVIDERS, byokProvider, plausibleKey, testProviderKey, userProviderKey } from '../_shared/byok.ts';

const READ_LIMIT = { limit: 60, windowMs: 60_000 };
// Saving and testing call the provider: keep it slow so nobody can use us to check stolen keys.
const CHECK_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method === 'GET') {
    const guard = await guardPaidEndpoint(req, 'provider-keys-read', READ_LIMIT);
    if (!guard.ok) return guard.response;
    const { data, error } = await serviceClient().from('user_provider_keys')
      .select('provider, last4, status, checked_at, last_used_at')
      .eq('wallet_address', guard.wallet);
    if (error) return jsonResponse({ error: 'Could not load your keys. Try again.' }, 503);
    const saved = new Map((data ?? []).map(row => [row.provider, row]));
    return jsonResponse({
      providers: Object.values(BYOK_PROVIDERS).map(p => {
        const row = saved.get(p.id);
        return {
          id: p.id, label: p.label, powers: p.powers, keysUrl: p.keysUrl,
          saved: row ? { last4: row.last4, status: row.status, checkedAt: row.checked_at, lastUsedAt: row.last_used_at } : null,
        };
      }),
    });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid request' }, 400); }
  const provider = byokProvider(body.provider);
  if (!provider) return jsonResponse({ error: 'Unknown provider' }, 400);

  if (body.action === 'remove') {
    const guard = await guardPaidEndpoint(req, 'provider-keys-read', READ_LIMIT);
    if (!guard.ok) return guard.response;
    const { error } = await serviceClient().rpc('byok_delete', { p_wallet: guard.wallet, p_provider: provider.id });
    if (error) return jsonResponse({ error: 'Could not remove the key. Try again.' }, 503);
    return jsonResponse({ ok: true });
  }

  if (body.action !== 'save' && body.action !== 'test') return jsonResponse({ error: 'Unknown action' }, 400);

  const guard = await guardPaidEndpoint(req, 'provider-keys-check', CHECK_LIMIT);
  if (!guard.ok) return guard.response;

  let key: string | null;
  if (body.action === 'save') {
    const raw = typeof body.key === 'string' ? body.key.trim() : body.key;
    if (!plausibleKey(raw)) return jsonResponse({ error: 'That does not look like a key. Paste it again.', code: 'BAD_FORMAT' }, 400);
    key = raw;
  } else {
    key = await userProviderKey(guard.wallet, provider.id);
    if (!key) return jsonResponse({ error: 'No key saved for this provider.', code: 'NOT_SAVED' }, 404);
  }

  const status = await testProviderKey(provider, key);
  if (status === 'unreachable') {
    return jsonResponse({ error: `Could not reach ${provider.label} to check the key. Try again soon.`, code: 'UNREACHABLE' }, 503);
  }
  if (status === 'invalid' && body.action === 'save') {
    return jsonResponse({ error: `${provider.label} rejected this key. Check you copied all of it.`, code: 'INVALID' }, 400);
  }

  if (body.action === 'save') {
    const { error } = await serviceClient().rpc('byok_save', {
      p_wallet: guard.wallet, p_provider: provider.id, p_key: key, p_status: status,
    });
    if (error) {
      console.error('byok_save failed', provider.id, error.code);
      return jsonResponse({ error: 'Could not save the key. Try again.' }, 503);
    }
  } else {
    await serviceClient().from('user_provider_keys')
      .update({ status, checked_at: new Date().toISOString() })
      .eq('wallet_address', guard.wallet).eq('provider', provider.id);
  }
  key = null;

  const { data } = await serviceClient().from('user_provider_keys')
    .select('last4, status').eq('wallet_address', guard.wallet).eq('provider', provider.id).maybeSingle();
  return jsonResponse({ ok: true, last4: data?.last4 ?? null, status: data?.status ?? status });
});
