import { describe, expect, it, vi } from 'vitest';
import { withSimpleAnonReads } from '../simpleReads';

const KEY = 'anon-key';
const BASE = 'https://x.supabase.co';

function setup() {
  const next = vi.fn(async (..._args: unknown[]) => new Response('[]'));
  return { next, fetchFn: withSimpleAnonReads(next, KEY) };
}

const anonHeaders = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'X-Client-Info': 'supabase-js-web/2', Accept: 'application/json' });

describe('withSimpleAnonReads', () => {
  it('moves the key into the URL and drops custom headers on an anon table read', async () => {
    const { next, fetchFn } = setup();
    await fetchFn(`${BASE}/rest/v1/posts?select=id`, { method: 'GET', headers: { ...anonHeaders(), 'Accept-Profile': 'public' } });
    const [url, init] = next.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).searchParams.get('apikey')).toBe(KEY);
    expect(new URL(url).searchParams.get('select')).toBe('id');
    expect([...new Headers(init.headers).keys()]).toEqual(['accept']);
  });

  it('leaves a signed-in read alone', async () => {
    const { next, fetchFn } = setup();
    const init = { headers: { ...anonHeaders(), Authorization: 'Bearer user-jwt' } };
    await fetchFn(`${BASE}/rest/v1/posts`, init);
    expect(next).toHaveBeenCalledWith(`${BASE}/rest/v1/posts`, init);
  });

  it('leaves reads that still need a preflight alone', async () => {
    const { next, fetchFn } = setup();
    const init = { headers: { ...anonHeaders(), Prefer: 'count=exact' } };
    await fetchFn(`${BASE}/rest/v1/posts`, init);
    expect(next).toHaveBeenCalledWith(`${BASE}/rest/v1/posts`, init);
  });

  it('leaves writes, rpc, functions and storage alone', async () => {
    const { next, fetchFn } = setup();
    const calls: [string, RequestInit][] = [
      [`${BASE}/rest/v1/posts`, { method: 'POST', body: '{}', headers: anonHeaders() }],
      [`${BASE}/rest/v1/rpc/fn`, { headers: anonHeaders() }],
      [`${BASE}/functions/v1/fn`, { headers: anonHeaders() }],
      [`${BASE}/storage/v1/object/x`, { headers: anonHeaders() }],
    ];
    for (const [u, i] of calls) await fetchFn(u, i);
    calls.forEach(([u, i], n) => expect(next.mock.calls[n]).toEqual([u, i]));
  });
});
