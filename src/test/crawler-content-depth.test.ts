// @vitest-environment node
// (the worker runs on the Workers runtime; jsdom lacks AbortSignal.timeout,
// which every bounded upstream read in it uses)
/**
 * What a crawler actually reads on the pages the worker serves it, end to end
 * through the worker's own fetch handler. The 2026-09-29 Googlebot audit found:
 *
 *   - the one standalone guide served a 328-word summary of a ~1,500-word page,
 *     and two thinner guides competed with the flagship post on its query;
 *   - video posts carried no <video>, a VideoObject whose embedUrl was the page
 *     itself, and no link from any post to its author;
 *   - profiles with no posts, test stores, a private community and a $50,000
 *     "i sell dehub" listing all indexable;
 *   - `Join DeHub Whales's community`, and /docs/blog/<slug> answering 200.
 *
 * Every upstream here (the ssr-seo fn, api.dehub.io, PostgREST, ASSETS) is a
 * stub serving the shape it served live that day, trimmed to the tags in play.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';
const LOGO = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/new_logo_Dehub.jpg';

/** ASSETS as a directory: public/ on disk, 404 for anything missing. */
const ASSETS = {
  fetch: async (input: Request | URL | string) => {
    const path = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href).pathname;
    try {
      const body = readFileSync(resolve(ROOT, 'public', `.${decodeURIComponent(path)}`));
      return new Response(body, { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
};

const ctx = { waitUntil: () => {} };
const crawl = (url: string) =>
  worker.fetch(new Request(url, { headers: { 'User-Agent': GOOGLEBOT } }), { ASSETS }, ctx) as Promise<Response>;

type Upstream = (url: URL) => unknown | undefined;
/** Route every outbound fetch the worker makes to `upstream`, JSON unless it returns a string. */
function stubUpstream(upstream: Upstream) {
  vi.stubGlobal('fetch', async (input: Request | URL | string) => {
    const url = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
    const body = upstream(url);
    if (body === undefined) return new Response('', { status: 404 });
    return typeof body === 'string'
      ? new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
      : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}
afterEach(() => vi.unstubAllGlobals());

/** The deployed fn's page (generateMetaHTML), trimmed to the tags in play. */
function fnPage(o: {
  title: string;
  description: string;
  url: string;
  image: string;
  imageSize?: [number, number];
  card?: string;
  video?: string;
  jsonLd: unknown;
}) {
  const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t = esc(o.title);
  const d = esc(o.description);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t}</title>
  <meta name="description" content="${d}">
  <link rel="canonical" href="${o.url}">
  <meta property="og:type" content="${o.video ? 'video.other' : 'website'}">
  <meta property="og:url" content="${o.url}">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:image" content="${o.image}">
  <meta property="og:image:type" content="image/jpeg">${o.imageSize ? `
  <meta property="og:image:width" content="${o.imageSize[0]}">
  <meta property="og:image:height" content="${o.imageSize[1]}">` : ''}
  <meta property="og:image:alt" content="${t}">${o.video ? `
  <meta property="og:video" content="${o.video}">
  <meta property="og:video:type" content="video/mp4">` : ''}
  <meta name="twitter:card" content="${o.card || (o.video ? 'player' : 'summary_large_image')}">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${o.image}">
  <meta name="twitter:site" content="@DeHubApp">
  <script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>
</head>
<body style="font-family: sans-serif">
  <div style="max-width: 720px">
    <h1>${t}</h1>
    <p>${d}</p>
    <img src="${o.image}" style="max-width: 100%" alt="${t}" />
    <p style="margin-top: 30px;"><a href="${o.url}" style="color: #00ff00">View on DeHub</a></p>
  </div>
</body>
</html>`;
}

const ldOf = (html: string) =>
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
/** The VideoObject, as its own node or nested under the post's SocialMediaPosting. */
const videoOf = (html: string) => {
  const ld = ldOf(html);
  return ld.video || (ld['@graph'] || []).find((n: { '@type': string }) => n['@type'] === 'VideoObject');
};
const titleOf = (html: string) => html.match(/<title>([^<]*)<\/title>/)![1];
const robotsOf = (html: string) => (html.match(/<meta name="robots" content="([^"]*)">/) || [])[1] || '';

describe('the streaming guide', () => {
  const content = JSON.parse(
    readFileSync(resolve(ROOT, 'public/guide-content/best-decentralized-streaming-apps.json'), 'utf8'),
  ) as { html: string; wordCount: number };

  it('serves the whole article, not the summary', async () => {
    const res = await crawl('https://dehub.io/guides/best-decentralized-streaming-apps');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(content.wordCount).toBeGreaterThan(1200);
    const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(1200);
    // The comparison, the FAQ and the figures are all there.
    expect(html).toContain('<h2>The 6 best decentralized streaming apps</h2>');
    expect(html).toContain('<h3>Why are Theta and Livepeer not on this list?</h3>');
    expect(html).toContain('src="https://dehub.io/guides/fig-streaming-rails-not-apps.jpg"');
  });

  it('has one h1 and no h1 inside the sections', async () => {
    const html = await (await crawl('https://dehub.io/guides/best-decentralized-streaming-apps')).text();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'));
  });

  it('no longer links the page to itself or to the retired guides', async () => {
    const page = await (await crawl('https://dehub.io/guides/best-decentralized-streaming-apps')).text();
    const html = page.slice(page.indexOf('<body'));
    expect(html).not.toContain('Read the full');
    expect(html).not.toMatch(/href="https:\/\/dehub\.io\/guides\/best-decentralized-streaming-apps"/);
    expect(html).not.toContain('/guides/best-decentralized-social-media"');
    expect(html).not.toContain('/guides/best-web3-social-media-dapps"');
    expect(html).toContain('href="https://dehub.io/guides/best-decentralised-social-media-platforms-2026"');
  });

  it('dates its Article, gives it the share card, and credits the organisation', async () => {
    const html = await (await crawl('https://dehub.io/guides/best-decentralized-streaming-apps')).text();
    const ld = ldOf(html);
    expect(ld['@type']).toBe('Article');
    expect(ld.image).toBe('https://dehub.io/og/guides-best-decentralized-streaming-apps.jpg');
    expect(ld.datePublished).toBe('2026-09-13');
    expect(ld.dateModified).toBe('2026-09-29');
    expect(ld.author).toEqual({ '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' });
  });

  it('falls back to the summary, with its own h1, when the content file is missing', async () => {
    // A fresh isolate: the content file is cached per isolate once read.
    vi.resetModules();
    const fresh = (await import('../../CLOUDFLARE_WORKER_SEO.js')).default;
    const res = await fresh.fetch(
      new Request('https://dehub.io/guides/best-decentralized-streaming-apps', { headers: { 'User-Agent': GOOGLEBOT } }),
      { ASSETS: { fetch: async () => new Response('', { status: 404 }) } },
      ctx,
    );
    const html = await res.text();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('<h2>The six</h2>');
  });
});

describe('consolidated and duplicate blog URLs', () => {
  it.each(['best-decentralized-social-media', 'best-web3-social-media-dapps'])(
    '301s /guides/%s to the flagship post, for people and crawlers alike',
    async (slug) => {
      for (const ua of [GOOGLEBOT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36']) {
        const res = (await worker.fetch(new Request(`https://dehub.io/guides/${slug}`, { headers: { 'User-Agent': ua } }), { ASSETS }, ctx)) as Response;
        expect(res.status).toBe(301);
        expect(res.headers.get('Location')).toBe('https://dehub.io/guides/best-decentralised-social-media-platforms-2026');
      }
    },
  );

  it('the flagship post is published, so the 301 lands on a page', () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/blog-manifest.json'), 'utf8')) as { slug: string }[];
    expect(manifest.some((p) => p.slug === 'best-decentralised-social-media-platforms-2026')).toBe(true);
  });

  it('the SPA sends people to the same place', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
    expect(app).toContain('Object.entries(CONSOLIDATED_GUIDES).map(');
    expect(app).not.toContain('BestDecentralizedSocialMedia');
    expect(app).not.toContain('BestWeb3SocialMediaDapps');
  });

  it('the sitemap lists the streaming guide and neither redirected one', () => {
    const sitemap = readFileSync(resolve(ROOT, 'public/sitemap-static.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://dehub.io/guides/best-decentralized-streaming-apps</loc>');
    expect(sitemap).not.toContain('/guides/best-decentralized-social-media<');
    expect(sitemap).not.toContain('/guides/best-web3-social-media-dapps<');
  });

  it('301s /docs/blog/<slug> to /guides/<slug>', async () => {
    const res = await crawl('https://dehub.io/docs/blog/best-watch-to-earn-platforms-2026');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://dehub.io/guides/best-watch-to-earn-platforms-2026');
    // The index itself stays where it is.
    expect((await crawl('https://dehub.io/docs/blog')).status).toBe(200);
  });
});

describe('blog headings', () => {
  it('opens every section with an h2 under the post title', async () => {
    const html = await (await crawl('https://dehub.io/guides/best-watch-to-earn-platforms-2026')).text();
    const article = html.slice(html.indexOf('<article>'), html.indexOf('</article>'));
    expect(article.match(/<h1[\s>]/g)).toHaveLength(1);
    const first = article.match(/<h([2-6])>/);
    expect(first && first[1]).toBe('2');
    expect(article).toContain('<h2>How we assessed the best watch-to-earn platforms</h2>');
  });

  it('never skips from h1 to h3 in any post', () => {
    const dir = resolve(ROOT, 'public/blog-content');
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/blog-manifest.json'), 'utf8')) as { slug: string }[];
    for (const { slug } of manifest) {
      const { html } = JSON.parse(readFileSync(resolve(dir, `${slug}.json`), 'utf8')) as { html: string };
      expect(html, slug).not.toMatch(/<h1[\s>]/);
      // The outermost level a post uses is h2. (A post may still open with
      // a deeper one — `### TLDR;` before its first `##` — as its author wrote it.)
      const levels = [...html.matchAll(/<h([2-6])>/g)].map((m) => Number(m[1]));
      if (levels.length) expect(Math.min(...levels), slug).toBe(2);
    }
  });
});

describe('video post', () => {
  // /app/post/6126 as served live on 2026-09-29.
  const RECORD = {
    tokenId: 6126,
    name: 'Another Monopoly Video',
    description: '',
    postType: 'video',
    category: ['general', 'monopoly', 'board game', 'game'],
    createdAt: '2026-09-01T00:24:28.953Z',
    imageUrl: 'images/6126.jpg',
    videoUrl: 'videos/6126.mp4',
    videoDuration: 3678.25,
    minter: '0xd0d15539ab287d64af4cec5f463145cf85ab4e95',
    mintername: 'c0chraniz3r',
    minterDisplayName: 'Jesse Cochran',
    totalViews: 57,
    reactionCounts: { like: 12 },
    comments: [],
  };
  const URL_ = 'https://dehub.io/app/post/6126';
  const FN = fnPage({
    title: 'Another Monopoly Video',
    description: 'Post by Jesse Cochran on DeHub — join the decentralized creator network.',
    url: URL_,
    image: `${CDN}/images/6126.jpg`,
    video: `${CDN}/videos/6126.mp4`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: 'Another Monopoly Video',
          url: URL_,
          datePublished: '2026-09-01T00:24:28.953Z',
          author: { '@type': 'Person', name: 'Jesse Cochran' },
          image: `${CDN}/images/6126.jpg`,
        },
        {
          '@type': 'VideoObject',
          name: 'Another Monopoly Video',
          description: 'Post by Jesse Cochran on DeHub — join the decentralized creator network.',
          thumbnailUrl: `${CDN}/images/6126.jpg`,
          contentUrl: `${CDN}/videos/6126.mp4`,
          embedUrl: URL_,
          // The fn's `new Date().toISOString()` fallback.
          uploadDate: '2026-09-29T05:00:00.000Z',
          author: { '@type': 'Person', name: 'Jesse Cochran' },
        },
      ],
    },
  });

  const serve = (record: unknown = RECORD) => {
    stubUpstream((url) => {
      if (url.pathname.endsWith('/ssr-seo')) return FN;
      if (url.pathname === '/api/nft_info/6126') return { result: record };
      if (url.pathname === '/api/feed') return { result: [] };
      return undefined;
    });
    return crawl(URL_).then((r) => r.text());
  };

  it('puts a real <video> where the thumbnail was, poster and all', async () => {
    const html = await serve();
    const video = html.match(/<video[\s\S]*?<\/video>/)![0];
    expect(video).toContain('controls');
    expect(video).toContain('preload="none"');
    expect(video).toMatch(/poster="[^"]*images\/6126\.jpg"/);
    expect(video).toContain(`<source src="${CDN}/videos/6126.mp4" type="video/mp4">`);
    // The thumbnail stays as the fallback inside it.
    expect(video).toMatch(/<img [^>]*6126\.jpg/);
  });

  it('rewrites the VideoObject from the record', async () => {
    const html = await serve();
    const video = videoOf(html);
    expect(video.contentUrl).toBe(`${CDN}/videos/6126.mp4`);
    expect(video).not.toHaveProperty('embedUrl');
    expect(video.uploadDate).toBe('2026-09-01T00:24:28.953Z');
    expect(video.duration).toBe('PT1H1M18S');
    expect(video.thumbnailUrl).toContain('6126.jpg');
    expect(video.name).toBe(titleOf(html));
    expect(video.description).toBeTruthy();
  });

  it('links the post to its author', async () => {
    const html = await serve();
    expect(html).toContain('<a href="https://dehub.io/c0chraniz3r">Jesse Cochran (@c0chraniz3r)</a>');
    // …and the structured data points at the same profile.
    expect(ldOf(html).author.url).toBe('https://dehub.io/c0chraniz3r');
  });

  it('keeps the upload date the fn had when the record is unreachable, and links no author', async () => {
    const html = await serve(null);
    const video = videoOf(html);
    // No record: the Article's own date beats the fn's "now".
    expect(video.uploadDate).toBe('2026-09-01T00:24:28.953Z');
    expect(video.contentUrl).toBe(`${CDN}/videos/6126.mp4`);
    expect(html).toContain('<video');
    expect(html).not.toContain('dh-byline');
  });

  it('leaves an image post without a player', async () => {
    const image = fnPage({
      title: 'Post #3419 by Sultan on DeHub',
      description: 'Exquisite watercolor of a Royal Haveli.',
      url: 'https://dehub.io/app/post/3419',
      image: `${CDN}/feed-images/3419-1.jpg`,
      jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'Post #3419 by Sultan on DeHub' },
    });
    stubUpstream((url) => {
      if (url.pathname.endsWith('/ssr-seo')) return image;
      if (url.pathname === '/api/nft_info/3419') {
        return { result: { tokenId: 3419, name: '', description: 'Exquisite watercolor of a Royal Haveli.', postType: 'feed-images', mintername: 'umerkhan', minterDisplayName: 'Sultan' } };
      }
      if (url.pathname === '/api/feed') return { result: [] };
      return undefined;
    });
    const html = await (await crawl('https://dehub.io/app/post/3419')).text();
    expect(html).not.toContain('<video');
    // The caption, with the author — the longer suffix would pass 70 characters.
    expect(titleOf(html)).toBe('Exquisite watercolor of a Royal Haveli. — Sultan on DeHub');
    expect(html).toContain('<a href="https://dehub.io/umerkhan">Sultan (@umerkhan)</a>');
  });

  it('writes ISO 8601 durations', () => {
    const start = WORKER.indexOf('function isoDuration(seconds) {');
    const isoDuration = new Function(`${WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2)} return isoDuration;`)();
    expect(isoDuration(3678.25)).toBe('PT1H1M18S');
    expect(isoDuration(61)).toBe('PT1M1S');
    expect(isoDuration(3600)).toBe('PT1H');
    expect(isoDuration(0)).toBe('');
    expect(isoDuration(undefined)).toBe('');
  });
});

describe('profiles', () => {
  const profileFn = (handle: string, name: string, image = LOGO) =>
    fnPage({
      title: `Join @${handle} on DeHub today!`,
      description: `Connect with ${name} on DeHub, the open source alternative to legacy media.`,
      url: `https://dehub.io/${handle}`,
      image,
      imageSize: image === LOGO ? [200, 200] : [400, 400],
      card: 'summary',
      jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name, url: `https://dehub.io/${handle}` },
    });

  const serve = (handle: string, name: string, account: unknown, feed: unknown[] | null) => {
    stubUpstream((url) => {
      if (url.pathname.endsWith('/ssr-seo')) return profileFn(handle, name);
      if (url.pathname === `/api/account_info/${handle}`) return account === null ? undefined : { result: account };
      if (url.pathname === '/api/feed') return feed === null ? undefined : { result: feed };
      return undefined;
    });
    return crawl(`https://dehub.io/${handle}`).then((r) => r.text());
  };

  it('noindexes a profile with no posts', async () => {
    const html = await serve('ghost', 'Ghost', { address: '0x00000000000000000000000000000000000000aa', displayName: 'Ghost', uploads: 0 }, []);
    expect(robotsOf(html)).toBe('noindex, follow');
  });

  it('noindexes one whose uploads are all hidden from a signed-out visitor', async () => {
    const html = await serve('shy', 'Shy', { address: '0x00000000000000000000000000000000000000bb', displayName: 'Shy', uploads: 2 }, []);
    expect(robotsOf(html)).toBe('noindex, follow');
  });

  it('keeps a profile with posts indexable, lists them, and titles it with the display name', async () => {
    // /almondbloom has no avatar, so the posts were never listed before.
    const html = await serve(
      'almondbloom',
      'Ahmad Rasheed',
      { address: '0xd4bc8d273dcaeb1b59f0658f85a6c51531720378', displayName: 'Ahmad Rasheed', uploads: 3 },
      [{ tokenId: 3312, name: '', description: 'Morning light over the old city walls' }],
    );
    expect(robotsOf(html)).toBe('');
    expect(titleOf(html)).toBe('Ahmad Rasheed (@almondbloom) on DeHub');
    expect(html).toContain('<a href="https://dehub.io/app/post/3312">Morning light over the old city walls</a>');
  });

  it('does not noindex on an API that did not answer', async () => {
    expect(robotsOf(await serve('flaky', 'Flaky', null, null))).toBe('');
    expect(robotsOf(await serve('flaky', 'Flaky', { address: '0x00000000000000000000000000000000000000cc', uploads: 4 }, null))).toBe('');
  });

  it('declares the logo fallback at its real 1200x630 as a large card', async () => {
    const html = await serve('ghost', 'Ghost', null, null);
    expect(html).toContain(`<meta property="og:image" content="${LOGO}">`);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
});

describe('communities', () => {
  const communityFn = (name: string, slug: string) =>
    fnPage({
      title: `Join ${name}'s community on DeHub today`,
      description: 'A hub for the DeHub community’s most dedicated supporters. • 27 members',
      url: `https://dehub.io/app/communities/${slug}`,
      image: `https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/community-media/${slug}/avatar.png`,
      imageSize: [400, 400],
      card: 'summary',
      jsonLd: { '@context': 'https://schema.org', '@type': 'Organization', name },
    });
  const serve = (name: string, slug: string, row: unknown) => {
    stubUpstream((url) => {
      if (url.pathname.endsWith('/ssr-seo')) return communityFn(name, slug);
      if (url.pathname.endsWith('/rest/v1/communities')) return row === null ? undefined : [row];
      return undefined;
    });
    return crawl(`https://dehub.io/communities/${slug}`).then((r) => r.text());
  };
  const PUBLIC_ROW = { name: 'Last Chad Standing', description: 'The official community for the MMA battle-royale game.', avatar_url: 'a.png', is_private: false };

  it("writes the possessive of a name ending in s as English does", async () => {
    const html = await serve('DeHub Whales', 'dehub-whales', { ...PUBLIC_ROW, name: 'DeHub Whales' });
    expect(titleOf(html)).toBe("Join DeHub Whales' community on DeHub today");
    expect(html).not.toContain("Whales's");
    const other = await serve('Last Chad Standing', 'last-chad-standing', PUBLIC_ROW);
    expect(titleOf(other)).toBe("Join Last Chad Standing's community on DeHub today");
  });

  it('noindexes a private community, and leaves a public one alone', async () => {
    expect(robotsOf(await serve('DeHub Whales', 'dehub-whales', { ...PUBLIC_ROW, is_private: true }))).toBe('noindex, follow');
    expect(robotsOf(await serve('Last Chad Standing', 'last-chad-standing', PUBLIC_ROW))).toBe('');
  });

  it('noindexes a test community, and leaves the page alone when the row is unreadable', async () => {
    expect(robotsOf(await serve('Testing', 'testing', { ...PUBLIC_ROW, name: 'Testing' }))).toBe('noindex, follow');
    expect(robotsOf(await serve('Last Chad Standing', 'last-chad-standing', null))).toBe('');
  });
});

describe('thin and test entities', () => {
  const api = new Function(`
    ${WORKER.match(/^const UNTITLED_POST_TITLES = .*$/m)![0]}
    ${WORKER.match(/^const FILENAME_TITLE = .*$/m)![0]}
    ${WORKER.match(/^const PLACEHOLDER_TITLE = .*$/m)![0]}
    ${WORKER.match(/^const TEST_ENTITY_NAME = .*$/m)![0]}
    ${WORKER.match(/^const ENTITY_MIN_DESCRIPTION = .*$/m)![0]}
    ${(['function titleSaysNothing(title) {', 'function entityLooksThin({ name, description, image }) {'] as const)
      .map((sig) => WORKER.slice(WORKER.indexOf(sig), WORKER.indexOf('\n}\n', WORKER.indexOf(sig)) + 2))
      .join('\n')}
    return { entityLooksThin };
  `)() as { entityLooksThin: (e: { name?: string; description?: string; image?: string | null }) => boolean };

  it.each([
    ['a test event', { name: 'Test Event For Aaron', description: 'x'.repeat(80), image: 'a.jpg' }],
    ['a two-letter store', { name: '2L', description: 'Create', image: 'banner.jpg' }],
    ['a listing with a line of copy and no picture', { name: 'Dehub', description: 'i sell dehub', image: null }],
    ['a placeholder name', { name: 'asdf', description: 'x'.repeat(80), image: 'a.jpg' }],
  ])('flags %s', (_label, entity) => {
    expect(api.entityLooksThin(entity)).toBe(true);
  });

  it.each([
    ['a described store with no picture', { name: 'Vintage Synths', description: 'Restored analogue synthesisers, shipped worldwide from Leeds.', image: null }],
    ['a pictured listing with a short line', { name: 'Signed poster', description: 'A2, signed.', image: 'p.jpg' }],
  ])('leaves %s indexable', (_label, entity) => {
    expect(api.entityLooksThin(entity)).toBe(false);
  });

  it('is wired into the store, listing and event pages', () => {
    for (const sig of ['function buildStoreHtml(store) {', 'function buildListingHtml(listing) {', 'function buildEventHtml(event) {']) {
      const start = WORKER.indexOf(sig);
      expect(WORKER.slice(start, WORKER.indexOf('\n}\n', start)), sig).toMatch(/noindex: [^\n]*entityLooksThin\(/);
    }
  });
});

describe('/arcade', () => {
  it('has a title that says what the page is', async () => {
    const html = await (await crawl('https://dehub.io/arcade')).text();
    expect(titleOf(html)).toBe('DeHub Arcade — Free Browser Games, No Download');
    const description = html.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
