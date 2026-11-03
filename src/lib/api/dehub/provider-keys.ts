/**
 * Creators' own AI provider keys (supabase/functions/provider-keys).
 * The full key goes to the server once, on save, and is never sent back.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export type ProviderKeyStatus = 'working' | 'invalid' | 'no_credit' | 'disabled';

export interface ProviderKeyRow {
  id: string;
  label: string;
  powers: string;
  keysUrl: string;
  saved: { last4: string; status: ProviderKeyStatus; checkedAt: string; lastUsedAt: string | null } | null;
}

async function call<T>(method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const headers = { 'x-dehub-token': await ensureFreshToken() };
  const { data, error } = await supabase.functions.invoke('provider-keys', { method, body, headers });
  if (error) {
    // supabase-js wraps non-2xx answers; the server's message is in the response body.
    const ctx = (error as { context?: Response }).context;
    const payload = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(payload?.error || 'Something went wrong. Try again.');
  }
  return data as T;
}

export const listProviderKeys = () => call<{ providers: ProviderKeyRow[] }>('GET').then(r => r.providers);
export const saveProviderKey = (provider: string, key: string) =>
  call<{ ok: true; last4: string; status: ProviderKeyStatus }>('POST', { action: 'save', provider, key });
export const testProviderKey = (provider: string) =>
  call<{ ok: true; last4: string; status: ProviderKeyStatus }>('POST', { action: 'test', provider });
export const removeProviderKey = (provider: string) => call<{ ok: true }>('POST', { action: 'remove', provider });
