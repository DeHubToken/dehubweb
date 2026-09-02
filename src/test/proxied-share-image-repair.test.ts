/**
 * The share image a post or profile advertises to crawlers comes from the
 * deployed `ssr-seo` fn, and a sweep of all 2,000 sitemap posts on
 * 2026-09-02 found 434 of them pointing at something that is not an image:
 * a `<cdn>/nfts/images/` path the CDN answers 403 (the file moved to
 * `<cdn>/images/`), an upload served as `application/octet-stream`, or the
 * fn's own text-card renderer, which now 302s to the 200-square logo. The
 * proxy branch repairs all three on the way out; these pin what is rewritten,
 * what is left alone (og:video, the Supabase logo), and that the JSON-LD
 * moves with the meta tags.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

function decl(signature: string): string {
  const start = WORKER.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
}

function constant(name: string): string {
  const line = WORKER.match(new RegExp(`^const ${name} = .*$`, 'm'));
  expect(line, name).not.toBeNull();
  return line![0];
}

const { repairProxiedImages, transformedImageUrl, SHARE_IMAGE, CDN_ORIGIN } = new Function(`
  ${constant('APP_URL')}
  ${constant('SHARE_IMAGE')}
  ${constant('CDN_ORIGIN')}
  ${constant('IMAGE_TRANSFORM_BASE')}
  ${decl('function transformedImageUrl(url) {')}
  ${decl('function repairProxiedImages(html) {')}
  return { repairProxiedImages, transformedImageUrl, SHARE_IMAGE, CDN_ORIGIN };
`)() as {
  repairProxiedImages: (html: string) => string;
  transformedImageUrl: (url: string) => string;
  SHARE_IMAGE: string;
  CDN_ORIGIN: string;
};

const LOGO = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg';
const DEAD_CARD = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/og-image?post_id=2155';

/** A post head as the fn emits it: image tags, the video tags, both JSON-LD nodes. */
const postPage = (image: string, opts: { video?: string; card?: string; type?: string } = {}) => `<head>
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">
  <meta property="og:image:type" content="${opts.type ?? 'image/png'}">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
${opts.video ? `  <meta property="og:video" content="${opts.video}">\n  <meta property="og:video:secure_url" content="${opts.video}">\n` : ''}  <meta name="twitter:card" content="${opts.card ?? 'summary'}">
  <meta name="twitter:image" content="${image}">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: 'x', image },
      { '@type': 'VideoObject', name: 'x', thumbnailUrl: image, contentUrl: opts.video ?? '' },
    ],
  })}</script>
</head>`;

const valueOf = (html: string, tag: string) =>
  html.match(new RegExp(`(?:property|name)="${tag}" content="([^"]*)">`))![1];
const jsonLd = (html: string) =>
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
const IMAGE_TAGS = ['og:image', 'og:image:secure_url', 'twitter:image'];

describe('share image repair', () => {
  it('moves the legacy nfts/images path to images/ and serves it through the image transform', () => {
    const out = repairProxiedImages(postPage(`${CDN_ORIGIN}/nfts/images/1009.png`));
    const want = `https://dehub.io/cdn-cgi/image/format=jpeg,width=1200,fit=scale-down/${CDN_ORIGIN}/images/1009.png`;
    for (const tag of IMAGE_TAGS) expect(valueOf(out, tag)).toBe(want);
    expect(out).not.toContain('/nfts/images/');
    const ld = jsonLd(out);
    expect(ld['@graph'][0].image).toBe(want);
    expect(ld['@graph'][1].thumbnailUrl).toBe(want);
    expect(valueOf(out, 'og:image:type')).toBe('image/jpeg');
  });

  it('sizes an avatar to the 400×400 the fn declares', () => {
    const avatar = `${CDN_ORIGIN}/avatars/0x06da979225262715ed57449d0573329a1e685140.octet-stream`;
    expect(transformedImageUrl(avatar)).toBe(
      `https://dehub.io/cdn-cgi/image/format=jpeg,width=400,height=400,fit=cover/${avatar}`,
    );
  });

  it('leaves og:video and the mp4 behind it untouched', () => {
    const video = `${CDN_ORIGIN}/videos/3052.mp4`;
    const out = repairProxiedImages(postPage(`${CDN_ORIGIN}/images/3052.jpg`, { video, card: 'player' }));
    expect(valueOf(out, 'og:video')).toBe(video);
    expect(valueOf(out, 'og:video:secure_url')).toBe(video);
    expect(jsonLd(out)['@graph'][1].contentUrl).toBe(video);
    expect(valueOf(out, 'twitter:card')).toBe('player');
  });

  it('does not touch the Supabase-hosted logo, which the transform refuses', () => {
    const html = postPage(LOGO, { type: 'image/jpeg' });
    expect(repairProxiedImages(html)).toBe(html);
    expect(transformedImageUrl(LOGO)).toBe(LOGO);
  });

  it('swaps the dead text-card renderer for the brand card, with its dimensions', () => {
    const out = repairProxiedImages(postPage(DEAD_CARD));
    for (const tag of IMAGE_TAGS) expect(valueOf(out, tag)).toBe(SHARE_IMAGE);
    expect(jsonLd(out)['@graph'][0].image).toBe(SHARE_IMAGE);
    expect(valueOf(out, 'og:image:width')).toBe('1200');
    expect(valueOf(out, 'og:image:height')).toBe('630');
    expect(valueOf(out, 'og:image:type')).toBe('image/png');
    expect(valueOf(out, 'twitter:card')).toBe('summary_large_image');
    expect(out).not.toContain('og-image?post_id');
  });

  it('never wraps a URL twice', () => {
    const once = repairProxiedImages(postPage(`${CDN_ORIGIN}/images/2606.jpg`));
    expect(repairProxiedImages(once)).toBe(once);
  });

  it('runs on entity responses only, after the description rewrite', () => {
    const call = WORKER.indexOf('html = repairProxiedImages(html);');
    const guard = WORKER.lastIndexOf('if (isEntityRoute) {', call);
    const enrich = WORKER.indexOf('html = enrichProfileMeta(html,');
    const cardSwap = WORKER.indexOf('const cardKey = ');
    expect(call).toBeGreaterThan(enrich);
    expect(guard).toBeGreaterThan(enrich);
    expect(cardSwap).toBeGreaterThan(call);
  });
});

describe('docs index structured data', () => {
  it('carries a CollectionPage naming every docs page', () => {
    const start = WORKER.indexOf('function buildDocsIndexHtml() {');
    const body = WORKER.slice(start, WORKER.indexOf('\n}\n', start));
    expect(body).toContain("'@type': 'CollectionPage'");
    expect(body).toContain("'@type': 'TechArticle'");
    expect(body).toContain('Object.entries(DOCS_PAGES)');
  });
});
