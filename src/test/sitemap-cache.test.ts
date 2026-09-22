// @vitest-environment node
/**
 * `/sitemap-posts-1.xml` answered in 21–23 seconds, warm and cold, measured on
 * 2026-09-22. It walks ~33 pages of the feed and sleeps out api.dehub.io's
 * rate-limit windows between them, and the `s-maxage=3600` on the response
 * never helped: a Worker's generated response is not zone-cached unless the
 * Worker puts it in the cache itself. Google abandons slow sitemap fetches, so
 * every post URL in the file was at risk of never being read.
 *
 * What matters here is not that a cache exists but that nothing waits on a
 * rebuild it could have avoided — a hit is answered without building, a stale
 * copy is answered and refreshed behind the response, and a failed rebuild
 * keeps serving the last good copy rather than falling through to the
 * unfiltered sitemap. None of that is visible in a single response.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedSitemap } from '../../CLOUDFLARE_WORKER_SEO.js';

const URL_UNDER_TEST = 'https://dehub.io/sitemap-posts-1.xml';

/** The Cache API reduced to what cachedSitemap uses, keyed by URL. */
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    async match(key: Request) {
      const hit = store.get(key.url);
      return hit ? hit.clone() : undefined;
    },
    async put(key: Request, res: Response) {
      store.set(key.url, res);
    },
  };
}

/** A ctx whose background work can be awaited, like waitUntil's real contract. */
function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    settled: () => Promise.all(pending),
  };
}

const built = (xml: string, builtAt: number) =>
  new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Sitemap-Built': String(builtAt),
    },
  });

let cache: ReturnType<typeof fakeCache>;

beforeEach(() => {
  cache = fakeCache();
  vi.stubGlobal('caches', { default: cache });
});

describe('cachedSitemap', () => {
  it('builds and caches when nothing is stored', async () => {
    const build = vi.fn(async () => built('<urlset/>', Date.now()));

    const res = await cachedSitemap(new Request(URL_UNDER_TEST), fakeCtx(), build);

    expect(build).toHaveBeenCalledTimes(1);
    expect(await res!.text()).toBe('<urlset/>');
    expect(cache.store.has(URL_UNDER_TEST)).toBe(true);
  });

  it('answers a fresh hit without building', async () => {
    cache.store.set(URL_UNDER_TEST, built('<urlset>fresh</urlset>', Date.now()));
    const build = vi.fn(async () => built('<urlset>rebuilt</urlset>', Date.now()));

    const res = await cachedSitemap(new Request(URL_UNDER_TEST), fakeCtx(), build);

    expect(build).not.toHaveBeenCalled();
    expect(await res!.text()).toBe('<urlset>fresh</urlset>');
  });

  it('answers a stale hit immediately and rebuilds behind it', async () => {
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    cache.store.set(URL_UNDER_TEST, built('<urlset>stale</urlset>', twoHoursAgo));
    const build = vi.fn(async () => built('<urlset>rebuilt</urlset>', Date.now()));
    const ctx = fakeCtx();

    const res = await cachedSitemap(new Request(URL_UNDER_TEST), ctx, build);

    // The slow walk must not be on the response path.
    expect(await res!.text()).toBe('<urlset>stale</urlset>');
    await ctx.settled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(await cache.store.get(URL_UNDER_TEST)!.text()).toBe('<urlset>rebuilt</urlset>');
  });

  it('keeps serving the last good copy when a rebuild fails', async () => {
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    cache.store.set(URL_UNDER_TEST, built('<urlset>stale</urlset>', twoHoursAgo));
    const ctx = fakeCtx();

    const res = await cachedSitemap(new Request(URL_UNDER_TEST), ctx, async () => null);

    expect(await res!.text()).toBe('<urlset>stale</urlset>');
    await ctx.settled();
    expect(await cache.store.get(URL_UNDER_TEST)!.text()).toBe('<urlset>stale</urlset>');
  });

  it('returns null on a cold cache the build cannot fill, so the caller falls through', async () => {
    const res = await cachedSitemap(new Request(URL_UNDER_TEST), fakeCtx(), async () => null);

    expect(res).toBeNull();
  });

  it('does not let a throwing build take the request down', async () => {
    const res = await cachedSitemap(new Request(URL_UNDER_TEST), fakeCtx(), async () => {
      throw new Error('feed unreachable');
    });

    expect(res).toBeNull();
  });
});
