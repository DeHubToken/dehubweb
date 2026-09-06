import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxyApiRequest } from '../../CLOUDFLARE_WORKER_SEO.js';

describe('API relay', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards the path, query, method and authorization header to the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const request = new Request('https://dehub.io/_api/api/feed?page=2', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample: true }),
    });

    const response = await proxyApiRequest(request);

    const [forwardedUrl, forwardedInit] = fetchSpy.mock.calls[0];
    expect(String(forwardedUrl)).toBe('https://api.dehub.io/api/feed?page=2');
    expect(forwardedInit?.method).toBe('POST');
    expect(new Headers(forwardedInit?.headers).get('authorization')).toBe('Bearer token');
    expect(JSON.parse(new TextDecoder().decode(forwardedInit?.body as ArrayBuffer))).toEqual({ sample: true });
    expect(response.headers.get('X-DeHub-Relay')).toBe('dehub.io');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns a bounded JSON error if the upstream connection fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const response = await proxyApiRequest(
      new Request('https://dehub.io/_api/api/feed'),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    await expect(response.json()).resolves.toMatchObject({ status: false });
  });
});
