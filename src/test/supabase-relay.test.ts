import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { proxySupabaseRequest } from '../../CLOUDFLARE_WORKER_SEO.js';

const SB = 'https://aigxuutjaqsywioxjefr.supabase.co';

function mockUpstream(make = () => new Response('{"ok":true}', {
  status: 200,
  headers: { 'Content-Type': 'application/json', 'Keep-Alive': 'timeout=5', 'Cache-Control': 'public, max-age=60' },
})) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => make());
}

describe('Supabase relay', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards path, query, method, auth headers and body to the project host only', async () => {
    const fetchSpy = mockUpstream();
    const request = new Request('https://dehub.io/_sb/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        apikey: 'anon',
        Authorization: 'Bearer t',
        'Content-Type': 'application/json',
        'Keep-Alive': 'timeout=5',
        'Proxy-Authorization': 'x',
        'X-Forwarded-For': '1.2.3.4',
        'CF-Connecting-IP': '1.2.3.4',
      },
      body: JSON.stringify({ refresh_token: 'r' }),
    });

    const response = await proxySupabaseRequest(request);

    const [forwardedUrl, init] = fetchSpy.mock.calls[0];
    expect(String(forwardedUrl)).toBe(`${SB}/auth/v1/token?grant_type=refresh_token`);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    const headers = new Headers(init?.headers);
    expect(headers.get('apikey')).toBe('anon');
    expect(headers.get('authorization')).toBe('Bearer t');
    for (const dropped of ['keep-alive', 'proxy-authorization', 'x-forwarded-for', 'cf-connecting-ip', 'host']) {
      expect(headers.has(dropped)).toBe(false);
    }
    expect(JSON.parse(new TextDecoder().decode(init?.body as ArrayBuffer))).toEqual({ refresh_token: 'r' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.has('Keep-Alive')).toBe(false);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('keeps a relative-looking path on the project host', async () => {
    const fetchSpy = mockUpstream();
    await proxySupabaseRequest(new Request('https://dehub.io/_sb//evil.example/rest/v1/x'));
    expect(new URL(String(fetchSpy.mock.calls[0][0])).origin).toBe(SB);
  });

  it('refuses dot segments and encoded separators', async () => {
    const fetchSpy = mockUpstream();
    const raw = (path: string) => ({ url: `https://dehub.io${path}`, method: 'GET', headers: new Headers() }) as unknown as Request;
    for (const request of [
      raw('/_sb/../../etc/passwd'),
      raw('/_sb/%2e%2e/%2e%2e/etc/passwd'),
      raw('/_sb/rest%2F..%2Fadmin'),
      raw('/_sb/rest%5c..%5cadmin'),
      raw('/_sb/%E0%A4%A'),
    ]) {
      const response = await proxySupabaseRequest(request);
      expect(response.status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers a bounded 502 when the project host is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const response = await proxySupabaseRequest(new Request('https://dehub.io/_sb/rest/v1/posts'));
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is routed on app hosts ahead of the www redirect, and nowhere else', async () => {
    const fetchSpy = mockUpstream();
    const www = await worker.fetch(
      new Request('https://www.dehub.io/_sb/rest/v1/posts', { method: 'POST', body: '{}' }),
      {},
      {},
    );
    expect(www.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${SB}/rest/v1/posts`);

    await worker.fetch(new Request('https://staging.dehub.io/_sb/rest/v1/a'), {}, {});
    expect(String(fetchSpy.mock.calls[1][0])).toBe(`${SB}/rest/v1/a`);

    const alias = await worker.fetch(new Request('https://dehub.net/_sb/rest/v1/a'), {}, {});
    expect(alias.status).toBe(301);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
