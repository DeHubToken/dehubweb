import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';
import { embedRoute, embedSize, embedSnippet, oembedLinkTag, postIdFromUrl } from '../../server/post-embed.js';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';

const ASSETS = { fetch: async () => new Response('not found', { status: 404 }) };
const ctx = { waitUntil: () => {} };
const get = (url: string) => worker.fetch(new Request(url), { ASSETS }, ctx) as Promise<Response>;

const videoPost = {
  tokenId: 12,
  name: 'Skate session',
  description: 'First line <script>x</script>\n\nSecond paragraph',
  postType: 'video',
  videoUrl: 'videos/12.mp4',
  imageUrl: 'images/12.jpg',
  mintername: 'akcil',
  minterDisplayName: 'Akçil',
  minterAvatarUrl: 'avatars/akcil.jpg',
  createdAt: '2026-10-23T17:17:10.112Z',
  detectedLanguage: 'tr',
  plansDetails: [],
  streamInfo: { isLockContent: false, isPayPerView: false },
};
const gated = { ...videoPost, tokenId: 13, plansDetails: [{ id: 'gold' }] };

function stubApi(records: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (input: Request | URL | string) => {
    const url = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
    const id = (url.pathname.match(/^\/api\/nft_info\/(\d+)$/) || [])[1];
    if (id && records[id]) return Response.json({ result: records[id] });
    return new Response('', { status: 404 });
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('urls', () => {
  it('knows the embed page and every post URL shape', () => {
    expect(embedRoute('/app/post/12/embed')).toBe('12');
    expect(embedRoute('/app/post/12')).toBeNull();
    expect(postIdFromUrl('https://dehub.io/app/post/12')).toBe('12');
    expect(postIdFromUrl('https://dehub.io/app/post/12?ref=abc')).toBe('12');
    expect(postIdFromUrl('https://www.dehub.io/posts/12')).toBe('12');
    expect(postIdFromUrl('https://staging.dehub.io/post/12')).toBe('12');
    expect(postIdFromUrl('https://evil.example/app/post/12')).toBeNull();
    expect(postIdFromUrl('https://dehub.io/maldoteth')).toBeNull();
    expect(postIdFromUrl('not a url')).toBeNull();
  });

  it('sizes the frame to the post and to the space it is given', () => {
    const video = embedSize(videoPost);
    expect(video.width).toBe(550);
    expect(video.height).toBeGreaterThan(Math.round((518 * 9) / 16));
    expect(embedSize(videoPost, 400).width).toBe(400);
    expect(embedSize(videoPost, 9999).width).toBe(550);
    expect(embedSize(videoPost, undefined, 200).height).toBe(200);
    expect(embedSize({ postType: 'feed-simple', description: 'hi' }).height).toBeLessThan(video.height);
  });

  it('writes the embed code sites paste', () => {
    expect(embedSnippet('https://dehub.io', 12, { width: 550, height: 480 })).toBe(
      '<iframe src="https://dehub.io/app/post/12/embed" class="dehub-embed" style="max-width: 100%; border: 0" width="550" height="480" allowfullscreen="allowfullscreen" allow="fullscreen; picture-in-picture" loading="lazy"></iframe><script src="https://dehub.io/embed.js" async="async"></script>',
    );
  });
});

describe('embed page', () => {
  it('renders a public post, framable from anywhere', async () => {
    stubApi({ 12: videoPost });
    const res = await get('https://dehub.io/app/post/12/embed');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toBe('frame-ancestors *');
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await res.text();
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('<span class="name">Akçil</span>');
    expect(html).toContain('<span class="handle">@akcil</span>');
    expect(html).toContain(`src="${CDN}/videos/12.mp4"`);
    expect(html).toContain('<p>First line &lt;script&gt;x&lt;/script&gt;</p><p>Second paragraph</p>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('<time datetime="2026-10-23T17:17:10.112Z">2026-10-23</time>');
    expect(html).toContain('href="https://dehub.io/app/post/12"');
  });

  it('shows a gated post as its author and a link, nothing more', async () => {
    stubApi({ 13: gated });
    const html = await (await get('https://dehub.io/app/post/13/embed')).text();
    expect(html).toContain('class="locked"');
    expect(html).not.toContain('videos/12.mp4');
    expect(html).not.toContain('First line');
  });

  it('404s a post that does not exist', async () => {
    stubApi({});
    expect((await get('https://dehub.io/app/post/99/embed')).status).toBe(404);
  });
});

describe('oEmbed', () => {
  it('answers for a public post', async () => {
    stubApi({ 12: videoPost });
    const res = await get(`https://dehub.io/api/oembed?url=${encodeURIComponent('https://dehub.io/app/post/12')}&format=json&maxwidth=400`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body).toMatchObject({
      version: '1.0',
      type: 'video',
      provider_name: 'DeHub',
      provider_url: 'https://dehub.io',
      title: 'Skate session',
      author_name: 'Akçil',
      author_url: 'https://dehub.io/akcil',
      width: 400,
    });
    expect(body.html).toContain('src="https://dehub.io/app/post/12/embed"');
    expect(body.html).toContain('width="400"');
  });

  it('follows the spec for everything else', async () => {
    stubApi({ 12: videoPost, 13: gated });
    const ask = (url: string, extra = '') => get(`https://dehub.io/api/oembed?url=${encodeURIComponent(url)}${extra}`);
    expect((await ask('https://dehub.io/app/post/12', '&format=xml')).status).toBe(501);
    expect((await ask('https://example.com/app/post/12')).status).toBe(404);
    expect((await ask('https://dehub.io/app/post/99')).status).toBe(404);
    expect((await ask('https://dehub.io/app/post/13')).status).toBe(401);
  });
});

describe('discovery', () => {
  it('is advertised for a public post only', () => {
    expect(oembedLinkTag('https://dehub.io', videoPost)).toBe(
      '<link rel="alternate" type="application/json+oembed" href="https://dehub.io/api/oembed?url=https%3A%2F%2Fdehub.io%2Fapp%2Fpost%2F12&amp;format=json">',
    );
    expect(oembedLinkTag('https://dehub.io', gated)).toBe('');
    expect(WORKER).toContain('const oembedTag = oembedLinkTag(APP_URL, record);');
  });
});
