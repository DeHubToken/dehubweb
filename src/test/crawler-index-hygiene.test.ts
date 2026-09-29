// @vitest-environment node
/**
 * The worker decides what a crawler may put in the index, and every leak here
 * looked healthy from the outside: a 200 with a plausible title.
 *
 *  - The homepage copied the request's query into its canonical, so every
 *    /?utm_source=…, /?fbclid=… and /?hl=xx declared itself the homepage.
 *  - A deleted or made-up bounty, event, stage, store, flow, pack or proposal
 *    answered 200 with the generic card, and so did an upstream timeout.
 *  - Any missing file (/x.pdf, /.env, /ads.txt) got the SPA shell at 200 with
 *    `index, follow`.
 *
 * These run the real request handler against stubbed upstreams, so they pin
 * status codes and headers rather than how the code happens to be spelled.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { isBountyIndexable, isFilePath, setPageUrl, stylePrerendered } from '../../CLOUDFLARE_WORKER_SEO.js';
import { isBountyIndexable as spaIsBountyIndexable } from '@/features/work/seo';

const ROOT = resolve(__dirname, '../..');
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.76 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const SHELL =
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>DeHub — Open Source, User Owned Social Media</title><meta name="robots" content="index, follow"></head><body><div id="root"></div></body></html>';

/** The ssr-seo function's default page: every URL built from original_url. */
function fnHomepage(originalUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DeHub — Open Source, User Owned &amp; Censorship Resistant Media</title>
<meta name="description" content="x">
<link rel="canonical" href="${originalUrl}">
<meta property="og:url" content="${originalUrl}">
<meta property="og:title" content="DeHub">
<meta name="twitter:url" content="${originalUrl}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"DeHub","sameAs":["https://x.com/DeHubApp"]}</script>
</head>
<body><h1>DeHub</h1><nav><a href="https://dehub.io/app/explore">Explore</a> <a href="https://dehub.io/app/stages">Stages</a> <a href="https://dehub.io/app/stake">Stake</a> <a href="https://dehub.io/guides">Blog</a></nav></body>
</html>`;
}

type Upstream = (url: URL) => Response | Promise<Response> | undefined;
let upstream: Upstream;
const upstreamCalls: string[] = [];

/** Static files the fake asset layer has. Anything else gets the SPA shell. */
const ASSET_FILES: Record<string, [string, string]> = {
  '/robots.txt': ['text/plain', 'User-agent: *'],
  '/sw.js': ['text/javascript', '//'],
  '/manual/guide.pdf': ['application/pdf', '%PDF'],
  '/seo-i18n.json': [
    'application/json',
    JSON.stringify({
      '/': {
        en: { title: 'DeHub — Open Source, User Owned Social Media', description: 'desc' },
        es: { title: 'DeHub ES', description: 'desc es', h1: 'DeHub ES', body: '<p>cuerpo</p>' },
      },
    }),
  ],
};

function makeEnv() {
  return {
    ASSETS: {
      fetch: vi.fn(async (input: Request | URL | string) => {
        const u = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
        const file = ASSET_FILES[u.pathname];
        if (file) return new Response(file[1], { status: 200, headers: { 'Content-Type': file[0] } });
        if (u.pathname.startsWith('/docs-content/')) return new Response('nope', { status: 404 });
        return new Response(SHELL, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }),
    },
  };
}

async function get(path: string, ua = GOOGLEBOT, host = 'https://dehub.io') {
  const res = await worker.fetch(new Request(`${host}${path}`, { headers: { 'User-Agent': ua } }), makeEnv(), {
    waitUntil() {},
  });
  const body = res.status === 301 || res.status === 302 ? '' : await res.text();
  return {
    status: res.status,
    location: res.headers.get('Location'),
    robots: res.headers.get('X-Robots-Tag'),
    retryAfter: res.headers.get('Retry-After'),
    body,
  };
}

const tag = (html: string, re: RegExp) => (html.match(re) || [])[1];
const canonicalOf = (html: string) => tag(html, /<link rel="canonical" href="([^"]*)">/);
const ogUrlOf = (html: string) => tag(html, /<meta property="og:url" content="([^"]*)">/);
const twitterUrlOf = (html: string) => tag(html, /<meta name="twitter:url" content="([^"]*)">/);

beforeEach(() => {
  upstreamCalls.length = 0;
  upstream = () => undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | URL | string) => {
      const u = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
      upstreamCalls.push(u.toString());
      const answer = await upstream(u);
      if (answer) return answer;
      if (u.hostname === 'api.dehub.io') return Response.json({ result: [] });
      return new Response('not stubbed', { status: 404 });
    }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('homepage canonical', () => {
  beforeEach(() => {
    upstream = (u) => {
      if (u.pathname.endsWith('/ssr-seo')) {
        return new Response(fnHomepage(u.searchParams.get('original_url') || ''), {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return undefined;
    };
  });

  for (const q of ['?utm_source=x&utm_medium=social', '?fbclid=XYZ', '?gclid=1', '?ref=abc', '?type=new']) {
    it(`does not self-canonicalise /${q}`, async () => {
      const { status, body } = await get(`/${q}`);
      expect(status).toBe(200);
      expect(canonicalOf(body)).toBe('https://dehub.io/');
      expect(ogUrlOf(body)).toBe('https://dehub.io/');
      expect(twitterUrlOf(body)).toBe('https://dehub.io/');
      expect(body.match(/rel="canonical"/g)).toHaveLength(1);
    });
  }

  // A language the homepage is not translated into is not a page at all: the
  // crawler is sent to the one it would duplicate (see localizePage).
  for (const q of ['?hl=xx', '?hl=zz', '?hl=en']) {
    it(`301s /${q} to the bare homepage`, async () => {
      const { status, location } = await get(`/${q}`);
      expect(status).toBe(301);
      expect(location).toBe('https://dehub.io/');
    });
  }

  it('keeps the ?hl= self-canonical for a locale the page is translated into', async () => {
    const { body } = await get('/?hl=es&utm_source=x');
    expect(canonicalOf(body)).toBe('https://dehub.io/?hl=es');
    expect(ogUrlOf(body)).toBe('https://dehub.io/?hl=es');
    expect(twitterUrlOf(body)).toBe('https://dehub.io/?hl=es');
  });

  it('canonicalises a mirror host onto dehub.io', async () => {
    const { body } = await get('/?ref=abc', GOOGLEBOT, 'https://staging.dehub.io');
    expect(canonicalOf(body)).toBe('https://dehub.io/');
  });

  it('links the canonical twins, not /app/* or the /guides redirect', async () => {
    const { body } = await get('/');
    for (const bad of ['/app/explore"', '/app/stages"', '/app/stake"', 'dehub.io/guides"']) {
      expect(body, bad).not.toContain(bad);
    }
    expect(body).toContain('href="https://dehub.io/stages"');
    expect(body).toContain('href="https://dehub.io/stake"');
    expect(body).toContain('href="https://dehub.io/docs/blog"');
  });

  it('publishes the current brand profiles and not the dead CoinGecko page', async () => {
    const { body } = await get('/');
    expect(body).toContain('https://www.instagram.com/dehub_official/');
    expect(body).toContain('https://www.tiktok.com/@dehub_official');
    expect(body).not.toContain('coingecko.com');
  });
});

describe('setPageUrl', () => {
  it('replaces every copy and adds what is missing', () => {
    const html = '<html><head><link rel="canonical" href="https://x/?a=1" /><meta property="og:url" content="https://x/?a=1"></head><body></body></html>';
    const out = setPageUrl(html, 'https://dehub.io/');
    expect(out.match(/rel="canonical"/g)).toHaveLength(1);
    expect(canonicalOf(out)).toBe('https://dehub.io/');
    expect(ogUrlOf(out)).toBe('https://dehub.io/');
    expect(out).not.toContain('twitter:url');
  });
});

describe('entity misses', () => {
  const ENTITY_PATHS = [
    '/bounty/999999',
    '/events/99999999',
    '/stages/9999999',
    '/stage/0123456789abcdef0123',
    '/stores/0123456789abcdef',
    '/creator/flow/abcdef12',
    '/governance/0123456789abcdef',
    '/packs/no-such-pack',
    '/dex/base/0x0000000000000000000000000000000000000001',
  ];

  it('404s a row that does not exist, noindex', async () => {
    upstream = (u) => (u.hostname.endsWith('supabase.co') && u.pathname.includes('/rest/v1/') ? Response.json([]) : undefined);
    for (const path of ENTITY_PATHS) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.robots, path).toBe('noindex');
    }
  });

  it('tells a search engine to come back when the table cannot be read', async () => {
    upstream = (u) => (u.pathname.includes('/rest/v1/') ? new Response('boom', { status: 500 }) : undefined);
    for (const path of ENTITY_PATHS) {
      const res = await get(path);
      expect(res.status, path).toBe(503);
      expect(res.retryAfter, path).toBe('120');
      expect(res.robots, path).toBe('noindex');
    }
  });

  it('still gives a link previewer the card when the table cannot be read', async () => {
    upstream = (u) => (u.pathname.includes('/rest/v1/') ? new Response('boom', { status: 500 }) : undefined);
    const res = await get('/bounty/999999', FACEBOOK);
    expect(res.status).toBe(200);
    expect(res.robots).toBe('noindex');
    expect(res.body).toContain('og:image');
  });

  it('404s a mini app slug with no app, instead of the homepage card', async () => {
    upstream = (u) => (u.hostname.endsWith('supabase.co') && u.pathname.includes('/rest/v1/') ? Response.json([]) : undefined);
    const res = await get('/apps/no-such-app');
    expect(res.status).toBe(404);
    expect(res.robots).toBe('noindex');
  });

  it('renders a pack and a DEX pool for crawlers instead of the noindexed shell', async () => {
    upstream = (u) => {
      if (!u.pathname.includes('/rest/v1/')) return undefined;
      if (u.pathname.endsWith('/creator_packs')) {
        return Response.json([{ slug: 'lofi-drums', name: 'Lofi Drums', kind: 'audio', cover_url: null, item_count: 12, created_at: '2026-09-01T00:00:00Z' }]);
      }
      if (u.pathname.endsWith('/dex_pools')) {
        return Response.json([{ chain: 'base', token_address: '0x0000000000000000000000000000000000000001', name: 'Test Token', symbol: 'TST' }]);
      }
      return Response.json([]);
    };
    const pack = await get('/packs/lofi-drums');
    expect(pack.status).toBe(200);
    expect(canonicalOf(pack.body)).toBe('https://dehub.io/packs/lofi-drums');
    const pool = await get('/dex/base/0x0000000000000000000000000000000000000001');
    expect(pool.status).toBe(200);
    expect(canonicalOf(pool.body)).toBe('https://dehub.io/dex/base/0x0000000000000000000000000000000000000001');
  });

  it('404s a store id that cannot be a store', async () => {
    const res = await get('/stores/nope');
    expect(res.status).toBe(404);
    expect(res.robots).toBe('noindex');
  });

  it('keeps a noindex on the cinema title fallback', async () => {
    const res = await get('/cinema/film/zzzzzz');
    expect(res.status).toBe(200);
    expect(res.robots).toBe('noindex, follow');
  });
});

describe('proxied render failures', () => {
  it('503s a search engine when the ssr function errors', async () => {
    upstream = (u) => (u.pathname.endsWith('/ssr-seo') ? new Response('err', { status: 502 }) : undefined);
    const res = await get('/app/post/123');
    expect(res.status).toBe(503);
    expect(res.retryAfter).toBe('120');
  });

  it('503s a search engine when the ssr function times out or throws', async () => {
    upstream = (u) => {
      if (u.pathname.endsWith('/ssr-seo')) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return undefined;
    };
    const res = await get('/app/post/123');
    expect(res.status).toBe(503);
    expect(res.robots).toBe('noindex');
  });

  it('keeps the fallback card for a previewer on the same failure', async () => {
    upstream = (u) => (u.pathname.endsWith('/ssr-seo') ? new Response('err', { status: 502 }) : undefined);
    const res = await get('/app/post/123', FACEBOOK);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Post #123 on DeHub');
  });
});

describe('files that are not there', () => {
  for (const path of ['/x.pdf', '/.env', '/index.php', '/wp-login.php', '/ads.txt', '/sitemap-blog.xml', '/.well-known/security.txt', '/og-missing.png', '/.git/config']) {
    it(`404s ${path} for crawlers and browsers alike`, async () => {
      for (const ua of [GOOGLEBOT, CHROME]) {
        const res = await get(path, ua);
        expect(res.status, `${path} ${ua.slice(0, 20)}`).toBe(404);
        expect(res.robots).toBe('noindex');
      }
    });
  }

  it('serves files that exist', async () => {
    for (const path of ['/robots.txt', '/sw.js', '/manual/guide.pdf']) {
      expect((await get(path, CHROME)).status, path).toBe(200);
    }
  });

  it('leaves extensionless .well-known paths and .html alone', async () => {
    expect((await get('/.well-known/change-password', CHROME)).status).toBe(200);
    expect((await get('/explore/index.html', CHROME)).status).toBe(200);
  });

  it('tells a file from a page', () => {
    expect(isFilePath('/uploads/DeHub-English-Whitepaper.pdf')).toBe(true);
    expect(isFilePath('/.env')).toBe(true);
    expect(isFilePath('/.well-known/security.txt')).toBe(true);
    expect(isFilePath('/.well-known/change-password')).toBe(false);
    expect(isFilePath('/some.slug')).toBe(false);
    expect(isFilePath('/explore/index.html')).toBe(false);
  });

  it('sends the legacy whitepaper PDFs to the docs', async () => {
    for (const path of ['/uploads/DeHub-English-Whitepaper.pdf', '/uploads/DeHub%20White%20Paper.pdf', '/uploads/dehub_litepaper_v2.pdf']) {
      const res = await get(path, CHROME);
      expect(res.status, path).toBe(301);
      expect(res.location).toBe('https://dehub.io/docs');
    }
  });
});

describe('URL-space redirects', () => {
  it('lowercases docs and blog paths', async () => {
    expect(await get('/Docs')).toMatchObject({ status: 301, location: 'https://dehub.io/docs' });
    expect(await get('/DOCS/FAQ')).toMatchObject({ status: 301, location: 'https://dehub.io/docs/faq' });
    expect(await get('/Guides/What-Is-Dehub')).toMatchObject({
      status: 301,
      location: 'https://dehub.io/guides/what-is-dehub',
    });
    expect(await get('/Guides')).toMatchObject({ status: 301, location: 'https://dehub.io/docs/blog' });
  });

  it('301s /index.html to the homepage', async () => {
    expect(await get('/index.html', CHROME)).toMatchObject({ status: 301, location: 'https://dehub.io/' });
  });

  it('301s a profile deep path to the profile', async () => {
    expect(await get('/aaron/anything/deeper')).toMatchObject({ status: 301, location: 'https://dehub.io/aaron' });
    expect(await get('/@aaron/x', CHROME)).toMatchObject({ status: 301, location: 'https://dehub.io/aaron' });
  });

  it('renders /%40user as the /@user profile for crawlers', async () => {
    upstream = (u) => {
      if (!u.pathname.endsWith('/ssr-seo')) return undefined;
      const user = (u.searchParams.get('path') || '').replace('/@', '');
      return new Response(
        `<!DOCTYPE html><html><head><title>Join @${user} on DeHub today!</title><link rel="canonical" href="https://dehub.io/${user}"></head><body><p>hi</p></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      );
    };
    const res = await get('/%40aaron');
    expect(res.status).toBe(200);
    expect(upstreamCalls.some((c) => new URL(c).searchParams.get('path') === '/@aaron')).toBe(true);
    expect(canonicalOf(res.body)).toBe('https://dehub.io/aaron');
  });
});

describe('noindexed SPA shell', () => {
  it('says noindex in the meta as well as the header', async () => {
    for (const path of ['/app/messages', '/dex/base/not-a-token', '/explore?app=1']) {
      const res = await get(path, CHROME);
      expect(res.robots, path).toBe('noindex, follow');
      expect(res.body, path).toContain('<meta name="robots" content="noindex, follow">');
      expect(res.body, path).not.toContain('content="index, follow"');
    }
  });

  it('leaves the shell alone where it is meant to rank', async () => {
    const res = await get('/explore', CHROME);
    expect(res.robots).toBeNull();
    expect(res.body).toContain('content="index, follow"');
  });
});

describe('post sitemap pages', () => {
  it('404s a page the index does not list, without walking the feed', async () => {
    upstream = (u) =>
      u.hostname === 'api.dehub.io' && u.pathname === '/api/feed' ? Response.json({ result: [{ tokenId: 6200 }] }) : undefined;
    for (const path of ['/sitemap-posts-2.xml', '/sitemap-posts-99.xml', '/sitemap-posts-0.xml', '/sitemap-posts-01.xml']) {
      upstreamCalls.length = 0;
      const res = await get(path);
      expect(res.status, path).toBe(404);
      // At most the one single-row read that counts the pages.
      expect(upstreamCalls.length, path).toBeLessThanOrEqual(1);
      expect(upstreamCalls.every((c) => c.includes('limit=1&')), path).toBe(true);
    }
  });

  it('serves a page that is listed', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
    upstream = (u) =>
      u.hostname === 'api.dehub.io' && u.pathname === '/api/feed'
        ? Response.json({ result: [{ tokenId: 60001 }], pagination: { hasMore: false } })
        : undefined;
    const res = await get('/sitemap-posts-2.xml');
    expect(res.status).toBe(200);
  });
});

describe('bounty indexability', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');
  it('drops an open bounty past its deadline, in the worker and the app alike', () => {
    for (const fn of [isBountyIndexable, spaIsBountyIndexable]) {
      expect(fn({ status: 'open', deadline: '2026-09-01T00:00:00Z' }, now)).toBe(false);
      expect(fn({ status: 'open', deadline: '2026-10-01T00:00:00Z' }, now)).toBe(true);
      expect(fn({ status: 'in_progress', deadline: null }, now)).toBe(true);
      expect(fn({ status: 'completed', deadline: null }, now)).toBe(false);
    }
  });
});

describe('site-wide crawler chrome', () => {
  it('links the canonical explore page and blog index', () => {
    const html = stylePrerendered('<html><head></head><body><p>x</p></body></html>');
    expect(html).toContain('href="https://dehub.io/explore">Open DeHub');
    expect(html).toContain('href="https://dehub.io/docs/blog">Blog');
    expect(html).not.toContain('/app/explore');
    expect(html).not.toContain('dehub.io/guides"');
  });
});

describe('robots.txt', () => {
  const robots = readFileSync(resolve(ROOT, 'public/robots.txt'), 'utf8');
  it('is one group, so every rule reaches every crawler', () => {
    expect(robots.match(/^User-agent:/gim)).toEqual(['User-agent:']);
    expect(robots).toMatch(/^User-agent: \*$/m);
  });
  it('keeps crawlers out of the API relays and nothing else', () => {
    const disallows = robots.match(/^Disallow: .*$/gm);
    expect(disallows).toEqual(['Disallow: /_api/', 'Disallow: /api/']);
    expect(robots).toContain('Sitemap: https://dehub.io/sitemap.xml');
  });
});

describe('docs routes', () => {
  const surface = readFileSync(resolve(ROOT, 'src/pages/DocsSurface.tsx'), 'utf8');
  const routes = [...surface.matchAll(/<Route path="(\/docs\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.includes(':'));

  it('finds the docs router', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('/docs/guidelines');
  });

  /**
   * /docs/guidelines was linked from the docs sidebar on every page and had no
   * entry in the worker, so every crawler that followed the link got a 404.
   * Any route the docs router serves has to be served to crawlers too: as a
   * page, a redirect, or a coming-soon noindex.
   */
  it('gives crawlers every route the docs router has', async () => {
    const missing: string[] = [];
    for (const path of routes) {
      const res = await get(path);
      if (res.status === 404) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it('renders the community guidelines with the docs card', async () => {
    const res = await get('/docs/guidelines');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Community Guidelines');
    expect(res.body).toContain('https://dehub.io/og/docs.jpg');
    expect(canonicalOf(res.body)).toBe('https://dehub.io/docs/guidelines');
  });
});
