// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RELAY_STICKY_MS,
  SUPABASE_RELAY_TARGET,
  createSupabaseRelayFetch,
} from '../relayFetch';

const SB = SUPABASE_RELAY_TARGET;
const RELAY = 'https://dehub.io/_sb';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
  };
}

function setup(route: (url: string) => Response | Error = () => new Response('ok')) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const outcome = route(url);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const storage = memoryStorage();
  const relayFetch = createSupabaseRelayFetch({
    relayBase: () => 'https://dehub.io',
    fetchImpl,
    storage: () => storage,
  });
  return { relayFetch, calls, fetchImpl, storage };
}

const directFails = (url: string) =>
  url.startsWith(SB) ? new TypeError('Failed to fetch') : new Response('via relay');

describe('Supabase relay fetch', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('uses the direct route only when it answers', async () => {
    const { relayFetch, calls } = setup();
    const res = await relayFetch(`${SB}/rest/v1/posts?select=id`, { method: 'GET' });
    expect(await res.text()).toBe('ok');
    expect(calls.map((c) => c.url)).toEqual([`${SB}/rest/v1/posts?select=id`]);
  });

  it('returns an HTTP error status as-is without switching route', async () => {
    const { relayFetch, calls } = setup(() => new Response('nope', { status: 503 }));
    const res = await relayFetch(`${SB}/rest/v1/posts`);
    expect(res.status).toBe(503);
    await relayFetch(`${SB}/rest/v1/posts`);
    expect(calls.every((c) => c.url.startsWith(SB))).toBe(true);
  });

  it('retries a GET once through the relay after a transport failure', async () => {
    const { relayFetch, calls } = setup(directFails);
    const res = await relayFetch(`${SB}/rest/v1/posts?select=id`, {
      method: 'GET',
      headers: { apikey: 'k', Authorization: 'Bearer t' },
    });
    expect(await res.text()).toBe('via relay');
    expect(calls.map((c) => c.url)).toEqual([
      `${SB}/rest/v1/posts?select=id`,
      `${RELAY}/rest/v1/posts?select=id`,
    ]);
    expect(new Headers(calls[1].init?.headers).get('apikey')).toBe('k');
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe('Bearer t');
  });

  it('never replays a REST mutation, but sends the next request to the relay', async () => {
    const { relayFetch, calls } = setup(directFails);
    await expect(
      relayFetch(`${SB}/rest/v1/posts`, { method: 'POST', body: '{"a":1}' }),
    ).rejects.toThrow('Failed to fetch');
    expect(calls).toHaveLength(1);

    const next = await relayFetch(`${SB}/rest/v1/posts`, { method: 'PATCH', body: '{"a":2}' });
    expect(await next.text()).toBe('via relay');
    expect(calls.map((c) => c.url)).toEqual([`${SB}/rest/v1/posts`, `${RELAY}/rest/v1/posts`]);
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[1].init?.body).toBe('{"a":2}');
  });

  it('replays an auth token POST through the relay', async () => {
    const { relayFetch, calls } = setup(directFails);
    const body = JSON.stringify({ refresh_token: 'r' });
    const res = await relayFetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', body });
    expect(await res.text()).toBe('via relay');
    expect(calls[1].url).toBe(`${RELAY}/auth/v1/token?grant_type=refresh_token`);
    expect(calls[1].init?.method).toBe('POST');
    expect(calls[1].init?.body).toBe(body);
  });

  it('does not replay a request whose body is a stream', async () => {
    const { relayFetch, calls } = setup(directFails);
    const stream = new ReadableStream({ start(c) { c.close(); } });
    await expect(
      relayFetch(`${SB}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', body: stream, duplex: 'half',
      } as RequestInit),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('leaves a caller abort alone: no replay and no route switch', async () => {
    const controller = new AbortController();
    controller.abort();
    const { relayFetch, calls } = setup((url) =>
      url.startsWith(SB) ? new DOMException('aborted', 'AbortError') : new Response('via relay'));
    await expect(relayFetch(`${SB}/rest/v1/posts`, { signal: controller.signal })).rejects.toThrow();
    await relayFetch(`${SB}/rest/v1/posts`, { method: 'POST', body: '{}' }).catch(() => {});
    expect(calls.every((c) => c.url.startsWith(SB))).toBe(true);
  });

  it('passes non-Supabase URLs through untouched', async () => {
    const { relayFetch, calls, fetchImpl } = setup(() => new TypeError('Failed to fetch'));
    const init = { method: 'GET' };
    await expect(relayFetch('https://api.dehub.io/api/feed', init)).rejects.toThrow();
    await expect(relayFetch('https://other.supabase.co/rest/v1/x')).rejects.toThrow();
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.dehub.io/api/feed',
      'https://other.supabase.co/rest/v1/x',
    ]);
    expect(fetchImpl.mock.calls[0][1]).toBe(init);
  });

  it('skips the relay entirely when there is no relay base (local/dev)', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const relayFetch = createSupabaseRelayFetch({ relayBase: () => null, fetchImpl, storage: () => null });
    await expect(relayFetch(`${SB}/rest/v1/posts`)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps using the relay for ten minutes, then probes direct again', async () => {
    let directUp = false;
    const { relayFetch, calls, storage } = setup((url) => {
      if (url.startsWith(SB)) return directUp ? new Response('direct') : new TypeError('Failed to fetch');
      return new Response('via relay');
    });
    await relayFetch(`${SB}/rest/v1/a`);
    expect(storage.getItem('dehub.sbRelayUntil')).not.toBeNull();
    directUp = true;

    vi.advanceTimersByTime(RELAY_STICKY_MS - 1000);
    calls.length = 0;
    expect(await (await relayFetch(`${SB}/rest/v1/b`)).text()).toBe('via relay');
    expect(calls.map((c) => c.url)).toEqual([`${RELAY}/rest/v1/b`]);

    vi.advanceTimersByTime(2000);
    calls.length = 0;
    expect(await (await relayFetch(`${SB}/rest/v1/c`)).text()).toBe('direct');
    expect(calls.map((c) => c.url)).toEqual([`${SB}/rest/v1/c`]);
  });

  it('restores the relay choice from session storage on a fresh page', async () => {
    const storage = memoryStorage();
    storage.setItem('dehub.sbRelayUntil', String(Date.now() + 60_000));
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
    const relayFetch = createSupabaseRelayFetch({ relayBase: () => 'https://dehub.io', fetchImpl, storage: () => storage });
    await relayFetch(`${SB}/storage/v1/object/public/a.png`);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${RELAY}/storage/v1/object/public/a.png`);
  });

  it('falls back to direct for a read if the relay fails while sticky', async () => {
    let relayUp = true;
    let directUp = false;
    const { relayFetch, calls } = setup((url) => {
      if (url.startsWith(SB)) return directUp ? new Response('direct') : new TypeError('Failed to fetch');
      return relayUp ? new Response('via relay') : new TypeError('Failed to fetch');
    });
    await relayFetch(`${SB}/rest/v1/a`);
    relayUp = false;
    directUp = true;
    calls.length = 0;
    expect(await (await relayFetch(`${SB}/rest/v1/b`)).text()).toBe('direct');
    calls.length = 0;
    await relayFetch(`${SB}/rest/v1/c`);
    expect(calls.map((c) => c.url)).toEqual([`${SB}/rest/v1/c`]);
  });

  it('treats a stalled direct read as a transport failure', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(SB)) return Promise.resolve(new Response('via relay'));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    });
    const relayFetch = createSupabaseRelayFetch({ relayBase: () => 'https://dehub.io', fetchImpl, storage: () => null });
    const pending = relayFetch(`${SB}/rest/v1/a`);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await (await pending).text()).toBe('via relay');
  });
});
