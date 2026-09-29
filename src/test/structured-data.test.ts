// @vitest-environment node
/**
 * Structured data and share cards on the crawler pages, end to end through the
 * worker: every JSON-LD block has to parse, and each type has to be one Google
 * accepts without an error for what the page actually is.
 *
 * - No SoftwareApplication / WebApplication / MobileApplication anywhere: the
 *   Software App result requires a rating or review, none of these pages has
 *   one, and without it Search Console lists each as an invalid item.
 * - Stores are OnlineStore (Store is a LocalBusiness and needs an address),
 *   events carry a location and a real organizer, profiles are ProfilePage,
 *   posts SocialMediaPosting, communities never an Organization, and the
 *   homepage drops the retired SearchAction.
 * - Declared og:image sizes are true: pictures go through the image transform
 *   at 1200x630, or go out undeclared.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const ROOT = resolve(__dirname, '../..');
const MANIFEST = readFileSync(resolve(ROOT, 'public/blog-manifest.json'), 'utf8');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const STORAGE = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public';
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';

type Ld = Record<string, unknown>;

/** Static assets: the blog manifest, and a miss for everything else. */
const env = {
  ASSETS: {
    fetch: async (input: Request | URL | string) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
      if (url.pathname === '/blog-manifest.json') {
        return new Response(MANIFEST, { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    },
  },
};

/** Stub the network: `routes` maps a URL prefix to a response factory. */
function network(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: Request | URL | string) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const hit = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => url.startsWith(prefix));
    return hit ? routes[hit]() : new Response('[]', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (value: unknown) =>
  () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const html = (body: string) => () => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

async function crawl(path: string) {
  const res = await worker.fetch(new Request(`https://dehub.io${path}`, { headers: { 'User-Agent': GOOGLEBOT } }), env, {
    waitUntil: () => {},
  });
  return { res, body: await res.text() };
}

/** Every JSON-LD block, parsed. Throws (fails the test) on one that doesn't. */
function jsonLd(body: string): Ld[] {
  return [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Every node in every block, @graph members and nested objects included. */
function nodes(blocks: Ld[]): Ld[] {
  const out: Ld[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      out.push(v as Ld);
      Object.values(v).forEach(walk);
    }
  };
  blocks.forEach(walk);
  return out;
}

const types = (body: string) => nodes(jsonLd(body)).map((n) => n['@type']).filter(Boolean);
const meta = (body: string, key: string) =>
  (body.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`)) || [])[1];

const APP_TYPES = ['SoftwareApplication', 'WebApplication', 'MobileApplication'];

function breadcrumb(body: string) {
  return nodes(jsonLd(body)).find((n) => n['@type'] === 'BreadcrumbList') as
    | { itemListElement: { position: number; name: string; item: string }[] }
    | undefined;
}

function expectValidTrail(body: string, last: string) {
  const list = breadcrumb(body);
  expect(list, 'BreadcrumbList').toBeDefined();
  const items = list!.itemListElement;
  expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
  for (const i of items) expect(i.item).toMatch(/^https:\/\/dehub\.io\//);
  expect(items[0].item).toBe('https://dehub.io/');
  expect(items[items.length - 1].item).toBe(last);
}

describe('edge-rendered pages', () => {
  it('marks the APK, the DEX and every arcade game without an app rich-result type', async () => {
    network({});
    for (const path of ['/apk', '/dex']) {
      const { body } = await crawl(path);
      expect(types(body), path).not.toEqual(expect.arrayContaining([expect.stringMatching(/Application$/)]));
      expect(types(body), path).toContain('WebPage');
    }
    for (const slug of ['gods-eye', 'kings-gambit', 'claude-of-duty', 'jungle-trail', 'street-slayer', 'trenchstar']) {
      const { body } = await crawl(`/arcade/${slug}`);
      const game = jsonLd(body).find((b) => b['@type'] === 'VideoGame');
      expect(game, slug).toBeDefined();
      expect(game!.image, slug).toMatch(/^https:\/\/dehub\.io\/arcade\//);
      for (const t of APP_TYPES) expect(types(body), slug).not.toContain(t);
      expectValidTrail(body, `https://dehub.io/arcade/${slug}`);
      expect(breadcrumb(body)!.itemListElement[1]).toMatchObject({ name: 'DeHub Arcade', item: 'https://dehub.io/arcade' });
    }
  });

  it('gives marketing and section pages the twitter text pair, og:locale and a breadcrumb', async () => {
    network({});
    for (const path of ['/pricing', '/explore']) {
      const { body } = await crawl(path);
      expect(meta(body, 'twitter:title'), path).toBe(meta(body, 'og:title'));
      expect(meta(body, 'twitter:description'), path).toBe(meta(body, 'og:description'));
      expect(meta(body, 'og:locale'), path).toBe('en_US');
      expect(body.match(/og:locale/g), path).toHaveLength(1);
      expectValidTrail(body, `https://dehub.io${path}`);
    }
  });

  it('describes /docs and /docs/blog for share cards', async () => {
    network({});
    for (const path of ['/docs', '/docs/blog']) {
      const { body } = await crawl(path);
      expect(meta(body, 'og:description'), path).toBeTruthy();
      expect(meta(body, 'twitter:description'), path).toBe(meta(body, 'og:description'));
      expectValidTrail(body, `https://dehub.io${path}`);
    }
  });

  it('gives a docs page its card as the article image and a Home › Docs trail', async () => {
    network({});
    const { body } = await crawl('/docs/overview');
    const article = jsonLd(body).find((b) => b['@type'] === 'TechArticle')!;
    expect(article.image).toBe('https://dehub.io/og/docs-overview.jpg');
    expect(article.author).toMatchObject({ '@type': 'Organization', name: 'DeHub' });
    expectValidTrail(body, 'https://dehub.io/docs/overview');
    expect(breadcrumb(body)!.itemListElement.map((i) => i.name)).toEqual(['DeHub', 'Docs', 'DeHub Docs — Overview'.replace(/ — DeHub( Docs)?$/, '')]);
  });

  it('gives a standalone guide an image, an author and a trail', async () => {
    network({});
    const { body } = await crawl('/guides/best-decentralized-social-media');
    const article = jsonLd(body).find((b) => b['@type'] === 'Article')!;
    expect(article.image).toBe('https://dehub.io/og/guides-best-decentralized-social-media.jpg');
    expect(article.author).toMatchObject({ '@type': 'Organization' });
    expectValidTrail(body, 'https://dehub.io/guides/best-decentralized-social-media');
  });

  it('bylines blog posts to the organisation and serves the card as a transformed JPEG', async () => {
    network({});
    const slug = JSON.parse(MANIFEST)[0].slug;
    const { body } = await crawl(`/guides/${slug}`);
    const [article, trail] = (jsonLd(body)[0]['@graph'] as Ld[]);
    expect(article.author).toEqual({ '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' });
    expect(trail['@type']).toBe('BreadcrumbList');
    const image = meta(body, 'og:image')!.replace(/&amp;/g, '&');
    expect(image).toBe(`https://dehub.io/cdn-cgi/image/fit=cover,width=1200,height=630,format=jpeg,quality=80/https://dehub.io/_og/blog/${encodeURIComponent(slug)}`);
    expect(meta(body, 'og:image:width')).toBe('1200');
  });

  it('never emits a SearchAction or a non-square logo', async () => {
    network({});
    const { body } = await crawl('/pricing');
    const org = nodes(jsonLd(body)).find((n) => n['@type'] === 'Organization')!;
    expect(org.logo).toEqual({ '@type': 'ImageObject', url: 'https://dehub.io/icon-512.png', width: 512, height: 512 });
  });
});

describe('entity pages', () => {
  it('marks a store as an OnlineStore with a declared 1200x630 card', async () => {
    network({
      'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/stores': json([
        { id: 'abcdef12-3456', name: 'Shop', description: 'Things', banner_url: `${STORAGE}/store-media/abc/banner.png` },
      ]),
    });
    const { body } = await crawl('/stores/abcdef12-3456');
    expect(types(body)).toContain('OnlineStore');
    expect(types(body)).not.toContain('Store');
    expect(meta(body, 'og:image')).toBe(
      'https://dehub.io/cdn-cgi/image/fit=cover,width=1200,height=630,format=jpeg,quality=80/https://dehub.io/_og/storage/store-media/abc/banner.png',
    );
    expect(meta(body, 'og:image:width')).toBe('1200');
    expect(meta(body, 'og:image:height')).toBe('630');
    expect(meta(body, 'twitter:title')).toBe(meta(body, 'og:title'));
    expectValidTrail(body, 'https://dehub.io/stores/abcdef12-3456');
    expect(breadcrumb(body)!.itemListElement.map((i) => i.name)).toEqual(['DeHub', 'Stores', 'Shop']);
  });

  it('gives an online event a VirtualLocation, its creator as organizer and a status', async () => {
    network({
      'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/community_events': json([
        { event_number: 3, title: 'AMA', starts_at: '2026-06-13T23:00:00+00:00', creator_username: 'mal', creator_wallet_address: '0x1234567890abcdef', is_private: false },
      ]),
    });
    const { body } = await crawl('/events/3');
    const event = jsonLd(body).find((b) => b['@type'] === 'Event')!;
    expect(event.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(event.location).toEqual({ '@type': 'VirtualLocation', url: event.url });
    expect(event.organizer).toEqual({ '@type': 'Person', name: '@mal', url: 'https://dehub.io/mal' });
    expect(event.eventStatus).toBe('https://schema.org/EventScheduled');
  });

  it('declares no size for a picture it cannot transform', async () => {
    network({
      'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/miniapp_apps': json([
        { slug: 'cards', name: 'Cards', domain: 'cards.example', tier: 'listed', manifest: { ogImageUrl: 'https://cards.example/og.png' } },
      ]),
    });
    const { body } = await crawl('/apps/cards');
    expect(meta(body, 'og:image')).toBe('https://cards.example/og.png');
    expect(meta(body, 'og:image:width')).toBeUndefined();
  });

  it('marks a listed mini app as a WebPage', async () => {
    network({
      'https://aigxuutjaqsywioxjefr.supabase.co/rest/v1/miniapp_apps': json([
        { slug: 'chess', name: 'Chess', domain: 'chess.example', tier: 'listed', manifest: {} },
      ]),
    });
    const { res, body } = await crawl('/apps/chess');
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
    expect(types(body)).toContain('WebPage');
    for (const t of APP_TYPES) expect(types(body)).not.toContain(t);
  });

  it('cards a Builder preview from the app it renders, noindexed', async () => {
    network({
      [`${STORAGE}/builder-apps/proj_123456/index.html`]: html(
        '<html><head><title>Tip Jar &amp; Co</title><meta name="description" content="Collect tips."></head></html>',
      ),
    });
    const { res, body } = await crawl('/builder/preview/proj_123456');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(body).toContain('<meta name="robots" content="noindex, follow">');
    expect(meta(body, 'og:title')).toBe('Tip Jar &amp; Co — Built with DeHub Builder');
    expect(meta(body, 'og:description')).toBe('Collect tips.');
    expect(meta(body, 'og:image')).toBe('https://dehub.io/og/builder.jpg');
    expect(meta(body, 'og:image:width')).toBe('1200');
  });

  it('still cards a Builder preview whose file is missing', async () => {
    network({});
    const { res, body } = await crawl('/builder/preview/proj_missing');
    expect(res.status).toBe(200);
    expect(meta(body, 'og:title')).toBe('Built with DeHub Builder');
  });
});

describe('proxied pages', () => {
  const FN = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo';

  it('rewrites a profile Person into a ProfilePage without the self sameAs', async () => {
    const avatar = `${CDN}/avatars/0x9324840523a5d17dd12a2f11a9472e5a199c1937.jpg`;
    network({
      [FN]: html(`<!DOCTYPE html><html><head><title>Join @maldoteth on DeHub today!</title>
<meta name="description" content="building DeHub and other things worth building on DeHub.">
<link rel="canonical" href="https://dehub.io/maldoteth">
<meta property="og:image" content="${avatar}">
<meta property="og:image:width" content="400">
<meta property="og:image:height" content="400">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"mal","url":"https://dehub.io/maldoteth","image":"${avatar}","sameAs":"https://dehub.io/maldoteth"}</script>
</head><body><h1>mal</h1></body></html>`),
    });
    const { body } = await crawl('/maldoteth');
    const page = jsonLd(body).find((b) => b['@type'] === 'ProfilePage')!;
    expect(page).toBeDefined();
    expect(page.mainEntity).toMatchObject({ '@type': 'Person', name: 'mal', alternateName: '@maldoteth', url: 'https://dehub.io/maldoteth' });
    expect((page.mainEntity as Ld).sameAs).toBeUndefined();
    expect(meta(body, 'og:locale')).toBe('en_US');
  });

  it('rewrites a video post into a SocialMediaPosting and drops the raw-MP4 player card', async () => {
    const poster = `${CDN}/images/6126.jpg`;
    network({
      [FN]: html(`<!DOCTYPE html><html><head><title>Another Monopoly Video</title>
<meta name="description" content="Monopoly night">
<link rel="canonical" href="https://dehub.io/app/post/6126">
<meta property="og:image" content="${poster}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:video" content="${CDN}/videos/6126.mp4">
<meta name="twitter:card" content="player">
<meta name="twitter:image" content="${poster}">
<meta name="twitter:player" content="${CDN}/videos/6126.mp4">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">
<meta name="twitter:player:stream" content="${CDN}/videos/6126.mp4">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@context":"https://schema.org","@type":"Article","headline":"Another Monopoly Video","description":"Monopoly night","url":"https://dehub.io/app/post/6126","datePublished":"2026-09-29T00:24:28.953Z","author":{"@type":"Person","name":"Jesse Cochran"},"image":"${poster}"},{"@type":"VideoObject","name":"Another Monopoly Video","thumbnailUrl":"${poster}","contentUrl":"${CDN}/videos/6126.mp4","uploadDate":"2026-09-29T00:24:28.953Z"}]}</script>
</head><body><h1>Another Monopoly Video</h1></body></html>`),
      'https://api.dehub.io/api/nft_info/6126': json({
        result: { tokenId: 6126, username: 'jesse', displayName: 'Jesse Cochran', description: 'Monopoly night with the crew', commentCount: 2, reactionCounts: { like: 5 }, postType: 'video' },
      }),
    });
    const { body } = await crawl('/app/post/6126');
    const [post] = jsonLd(body);
    expect(post['@type']).toBe('SocialMediaPosting');
    expect(post.author).toEqual({ '@type': 'Person', name: 'Jesse Cochran', url: 'https://dehub.io/jesse' });
    expect(post.text).toBe('Monopoly night with the crew');
    expect(post.datePublished).toBe('2026-09-29T00:24:28.953Z');
    expect(post.commentCount).toBe(2);
    expect((post.video as Ld)['@type']).toBe('VideoObject');
    expect((post.video as Ld).contentUrl).toBe(`${CDN}/videos/6126.mp4`);
    expect(types(body)).not.toContain('Article');

    expect(body).not.toContain('twitter:player');
    expect(meta(body, 'twitter:card')).toBe('summary_large_image');
    const card = `https://dehub.io/cdn-cgi/image/fit=cover,width=1200,height=630,format=jpeg,quality=80/${poster}`;
    expect(meta(body, 'og:image')).toBe(card);
    expect(meta(body, 'twitter:image')).toBe(card);
    expect(meta(body, 'og:image:width')).toBe('1200');
    expect(meta(body, 'og:image:height')).toBe('630');
    expect(meta(body, 'og:video')).toBe(`${CDN}/videos/6126.mp4`);
  });

  it('marks a community as a page, not an Organization, with a true-size card', async () => {
    const avatar = `${STORAGE}/community-media/dehub/avatar.jpg`;
    network({
      [FN]: html(`<!DOCTYPE html><html><head><title>DeHub community</title>
<link rel="canonical" href="https://dehub.io/app/communities/dehub">
<meta property="og:image" content="${avatar}">
<meta property="og:image:width" content="400">
<meta property="og:image:height" content="400">
<meta name="twitter:card" content="summary">
<meta name="twitter:image" content="${avatar}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"DeHub","url":"https://dehub.io/app/communities/dehub","description":"All things $DHB","image":"${avatar}"}</script>
</head><body><h1>DeHub</h1></body></html>`),
    });
    const { body } = await crawl('/communities/dehub');
    expect(types(body)).not.toContain('Organization');
    const page = jsonLd(body)[0];
    expect(page['@type']).toBe('CollectionPage');
    expect(page.name).toBe('DeHub — community on DeHub');
    expect(meta(body, 'og:image')).toBe(
      'https://dehub.io/cdn-cgi/image/fit=pad,width=1200,height=630,background=%23000000,format=jpeg,quality=80/https://dehub.io/_og/storage/community-media/dehub/avatar.jpg',
    );
    expect(meta(body, 'og:image:width')).toBe('1200');
    expect(meta(body, 'og:image:height')).toBe('630');
    expect(meta(body, 'twitter:card')).toBe('summary_large_image');
  });

  it('drops the retired SearchAction from the homepage and squares the logo', async () => {
    network({
      [FN]: html(`<!DOCTYPE html><html><head><title>DeHub — Open Source, User Owned &amp; Censorship Resistant Media</title>
<meta name="description" content="x">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"DeHub","url":"https://dehub.io","description":"x","potentialAction":{"@type":"SearchAction","target":"https://dehub.io/app/explore?q={search_term_string}","query-input":"required name=search_term_string"}},{"@type":"Organization","name":"DeHub","url":"https://dehub.io","logo":"https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/new_logo_Dehub.jpg","sameAs":["https://x.com/DeHubApp"]}]}</script>
</head><body></body></html>`),
    });
    const { body } = await crawl('/');
    const all = nodes(jsonLd(body));
    expect(all.map((n) => n['@type'])).not.toContain('SearchAction');
    const site = all.find((n) => n['@type'] === 'WebSite')!;
    expect(site).toMatchObject({ name: 'DeHub', url: 'https://dehub.io' });
    expect(site.potentialAction).toBeUndefined();
    expect(all.find((n) => n['@type'] === 'Organization')!.logo).toMatchObject({ '@type': 'ImageObject', width: 512, height: 512 });
  });
});

describe('share-card source relay', () => {
  it('relays a Supabase storage image for the transform', async () => {
    const fetchMock = network({
      [`${STORAGE}/community-media/dehub/avatar.jpg`]: () => new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } }),
    });
    const res = await worker.fetch(new Request('https://dehub.io/_og/storage/community-media/dehub/avatar.jpg'), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(fetchMock).toHaveBeenCalledWith(`${STORAGE}/community-media/dehub/avatar.jpg`, expect.anything());
  });

  it('never relays a document or an SVG', async () => {
    network({
      [`${STORAGE}/builder-apps/x/index.html`]: html('<script>alert(1)</script>'),
      [`${STORAGE}/community-media/x/logo.svg`]: () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    });
    for (const path of ['/_og/storage/builder-apps/x/index.html', '/_og/storage/community-media/x/logo.svg', '/_og/elsewhere/x.png']) {
      const res = await worker.fetch(new Request(`https://dehub.io${path}`), env, {});
      expect(res.status, path).toBe(404);
    }
  });

  it("renders a blog post's card from the manifest, by slug alone", async () => {
    const slug = JSON.parse(MANIFEST)[0].slug;
    const fetchMock = network({
      'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/blog-share-image': () =>
        new Response('png', { headers: { 'Content-Type': 'image/png' } }),
    });
    const res = await worker.fetch(new Request(`https://dehub.io/_og/blog/${slug}`), env, {});
    expect(res.status).toBe(200);
    const called = String(fetchMock.mock.calls[0][0]);
    expect(called).toContain(`slug=${slug}`);
    expect(called).toContain('width=1200');
  });
});
