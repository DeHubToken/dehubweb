// @vitest-environment node
/**
 * dehub.io -> riftn.com. Browser page loads go through the hand-off, crawlers
 * and apps get a path-preserving 301, machine-facing paths keep answering on
 * dehub.io.
 */
import { describe, expect, it } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const hit = async (url: string, headers: Record<string, string> = {}, method = 'GET') => {
  // Paths that are not redirected fall through to asset and upstream
  // bindings this test does not provide; reaching them means "served here".
  try {
    const res = await worker.fetch(new Request(url, { method, headers }), {});
    return { status: res.status, to: res.headers.get('Location') };
  } catch {
    return { status: 0, to: null };
  }
};

describe('dehub.io forwards to riftn.com', () => {
  it('301s crawlers and apps with path and query', async () => {
    // Crawlers and apps send no Sec-Fetch-Mode.
    expect(await hit('https://dehub.io/mal?tab=posts')).toEqual({ status: 301, to: 'https://riftn.com/mal?tab=posts' });
  });

  it('301s search crawlers even when they send browser fetch headers', async () => {
    const googlebot = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    expect(await hit('https://dehub.io/guides/x?a=1', { 'Sec-Fetch-Mode': 'navigate', 'User-Agent': googlebot }))
      .toEqual({ status: 301, to: 'https://riftn.com/guides/x?a=1' });
    expect(await hit('https://dehub.io/mal', { 'Sec-Fetch-Mode': 'navigate', 'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' }))
      .toEqual({ status: 301, to: 'https://riftn.com/mal' });
  });

  it('sends a browser through the hand-off first', async () => {
    expect(await hit('https://dehub.io/mal?tab=posts', { 'Sec-Fetch-Mode': 'navigate' }))
      .toEqual({ status: 302, to: '/_handoff-out?next=%2Fmal%3Ftab%3Dposts' });
  });

  it('serves the hand-off page itself on dehub.io', async () => {
    expect((await hit('https://dehub.io/_handoff-out?next=/', { 'Sec-Fetch-Mode': 'navigate', Cookie: 'dh_local=1' })).status).toBe(200);
  });

  it('keeps machine-facing paths and in-page fetches on dehub.io', async () => {
    for (const path of ['/.well-known/assetlinks.json', '/.well-known/webauthn', '/_sb/rest/v1/x', '/api/oembed']) {
      expect((await hit(`https://dehub.io${path}`)).status, path).not.toBe(301);
    }
    expect((await hit('https://dehub.io/version.json', { 'Sec-Fetch-Mode': 'cors' })).status).not.toBe(301);
    expect((await hit('https://dehub.io/mal', {}, 'POST')).status).not.toBe(301);
  });

  it('keeps serving the app WebViews on dehub.io', async () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; SM-S926B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36';
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    for (const ua of [android, ios]) {
      const res = await hit('https://dehub.io/arcade/street-slayer', { 'Sec-Fetch-Mode': 'navigate', 'User-Agent': ua });
      expect(res.status, ua).not.toBe(302);
      expect(res.status, ua).not.toBe(301);
    }
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect((await hit('https://dehub.io/mal', { 'Sec-Fetch-Mode': 'navigate', 'User-Agent': safari })).status).toBe(302);
  });

  it('folds www into the apex on both domains', async () => {
    expect(await hit('https://www.riftn.com/mal?x=1')).toEqual({ status: 301, to: 'https://riftn.com/mal?x=1' });
    expect(await hit('https://www.dehub.io/mal')).toEqual({ status: 301, to: 'https://riftn.com/mal' });
  });
});
