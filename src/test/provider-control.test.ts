// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { controlledProviderFetch, providerCooldown, ProviderControlError } from '../../supabase/functions/_shared/provider-control';
import { translationControl } from '../../supabase/functions/translate-text/control';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup(reserve: unknown = true, claim: unknown = { allowed: true, probe: false }) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://db.invalid' : key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'test' : undefined } });
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    if (url.endsWith('claim_provider_attempt')) return Response.json(claim);
    if (url.endsWith('reserve_translation_attempt')) return reserve instanceof Error ? Promise.reject(reserve) : Response.json(reserve);
    if (url.endsWith('finish_provider_attempt')) return new Response(null, { status: 204 });
    return new Response(null, { status: 402 });
  }));
  return calls;
}
const init = { method: 'POST', body: JSON.stringify({ max_tokens: 4000, messages: [{ content: 'hello' }] }) };
it('parks exhausted credentials and honors bounded provider backoff', () => {
  expect(providerCooldown(402, null)).toBe(3600);
  expect(providerCooldown(429, '120')).toBe(120);
  expect(providerCooldown(429, '999999')).toBe(3600);
  expect(providerCooldown(503, null)).toBe(30);
});
it('never calls or reserves when another instance has opened the circuit', async () => {
  const calls = setup(true, { allowed: false });
  await expect(translationControl(false)('test', 'https://provider.invalid', init)).rejects.toBeInstanceOf(ProviderControlError);
  expect(calls).toHaveLength(1);
});
it.each([false, new Error('database timeout')])('fails closed when reservation is refused or unavailable', async (reserve) => {
  const calls = setup(reserve);
  await expect(translationControl(true)('test', 'https://provider.invalid', init)).rejects.toBeInstanceOf(ProviderControlError);
  expect(calls.some(c => c.url === 'https://provider.invalid')).toBe(false);
});
it('reserves each attempted model and publishes a 402 cooldown', async () => {
  const calls = setup();
  await translationControl(true)('test', 'https://provider.invalid', init);
  expect(calls[1].body).toMatchObject({ p_bulk: true, p_output_tokens: 4000, p_cap: 20000 });
  expect(calls[1].body.p_input_bytes).toBe(new TextEncoder().encode(init.body).length);
  expect(calls.at(-1)?.body).toMatchObject({ p_cooldown_seconds: 3600, p_provider: 'test' });
});
it('does not send a request when the work lease is close to expiry', async () => {
  const calls = setup();
  await expect(translationControl(false, Date.now())('test', 'https://provider.invalid', init)).rejects.toBeInstanceOf(ProviderControlError);
  expect(calls).toHaveLength(0);
});
it('does not require a translation budget for other controlled callers', async () => {
  const calls = setup();
  await controlledProviderFetch('test', 'https://provider.invalid', init);
  expect(calls.some(c => c.url.endsWith('reserve_translation_attempt'))).toBe(false);
});

