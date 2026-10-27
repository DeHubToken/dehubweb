/** Shared provider failure state. No prompts, identities or credentials are stored. */
export async function controlRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new ProviderControlError('PROVIDER_CONTROL_UNAVAILABLE');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(2500),
  }).catch(() => { throw new ProviderControlError('PROVIDER_CONTROL_UNAVAILABLE'); });
  if (!response.ok) { await response.body?.cancel(); throw new ProviderControlError('PROVIDER_CONTROL_UNAVAILABLE'); }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export class ProviderControlError extends Error {
  constructor(public code: string, public retryAfter = 30) { super(code); }
}

export function providerCooldown(status: number, retryAfter: string | null): number {
  if ([401, 402, 403, 404].includes(status)) return 3600;
  if (status === 429) {
    const seconds = Number(retryAfter);
    const dated = retryAfter ? (Date.parse(retryAfter) - Date.now()) / 1000 : NaN;
    return Math.ceil(Math.min(3600, Math.max(15, Number.isFinite(seconds) && seconds > 0 ? seconds : Number.isFinite(dated) ? dated : 60)));
  }
  return status === 0 || status === 408 || status >= 500 ? 30 : 0;
}

export async function controlledProviderFetch(
  provider: string, url: string, init: RequestInit,
  beforeAttempt?: () => Promise<void>,
): Promise<Response> {
  const token = crypto.randomUUID();
  const claim = await controlRpc<{ allowed: boolean; probe?: boolean }>('claim_provider_attempt', { p_provider: provider, p_token: token });
  if (claim?.allowed !== true) throw new ProviderControlError('PROVIDER_COOLDOWN');
  // A denied budget must never result in a provider request.
  await beforeAttempt?.();
  const finish = async (cooldown: number) => {
    if (!cooldown && !claim.probe) return;
    await controlRpc('finish_provider_attempt', {
      p_provider: provider, p_token: token, p_probe: claim.probe === true, p_cooldown_seconds: cooldown,
    }).catch(() => console.warn('provider_control_write_failed', provider));
  };
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Bound connection establishment without truncating other features' streams.
    response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
  } catch (error) { await finish(30); throw error; }
  finally { clearTimeout(timer); }
  await finish(providerCooldown(response.status, response.headers.get('retry-after')));
  return response;
}
