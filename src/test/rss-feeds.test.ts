import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';
import { rssFeedRoute, rssRowIsPublic, profileFeedUrl } from '../../server/rss-feeds.js';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const ADDRESS = '0x9324840523a5d17dd12a2f11a9472e5a199c1937';

const ASSETS = { fetch: async () => new Response('not found', { status: 404 }) };
const ctx = { waitUntil: () => {} };
const get = (url: string) => worker.fetch(new Request(url), { ASSETS }, ctx) as Promise<Response>;

const account = {
  address: ADDRESS,
  username: 'maldoteth',
  displayName: 'mal',
  aboutMe: 'building DeHub.',
  avatarImageUrl: `avatars/${ADDRESS}.jpg`,
  uploads: 4,
};

const row = (tokenId: number, extra: Record<string, unknown> = {}) => ({
  tokenId,
  name: ' ',
  description: `Post ${tokenId} has a caption long enough to be its own title`,
  postType: 'feed-simple',
  minter: ADDRESS,
  minterDisplayName: 'mal',
  minterUsername: 'maldoteth',
  createdAt: '2026-10-20T10:00:00.000Z',
  category: ['general', 'music'],
  imageUrls: [],
  plansDetails: [],
  streamInfo: { isLockContent: false, isPayPerView: false },
  ...extra,
});

let feedQueries: URLSearchParams[] = [];
function stubApi({ rows = [row(10)], acct = account as unknown, feedDown = false } = {}) {
  feedQueries = [];
  vi.stubGlobal('fetch', async (input: Request | URL | string) => {
    const url = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
    if (url.pathname.startsWith('/api/account_info/')) {
      return acct ? Response.json({ result: acct }) : new Response('', { status: 404 });
    }
    if (url.pathname === '/api/feed') {
      feedQueries.push(url.searchParams);
      return feedDown ? new Response('', { status: 502 }) : Response.json({ status: true, result: rows });
    }
    return new Response('', { status: 404 });
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('feed routes', () => {
  const isProfile = (s: string) => !['app', 'docs', 'tags'].includes(s) && (!s.includes('.') || s.endsWith('.eth'));

  it('reads profile and tag feeds in the shapes Mastodon uses', () => {
    expect(rssFeedRoute('/maldoteth.rss', isProfile)).toEqual({ kind: 'profile', handle: 'maldoteth' });
    expect(rssFeedRoute('/@maldoteth.rss', isProfile)).toEqual({ kind: 'profile', handle: 'maldoteth' });
    expect(rssFeedRoute('/mal.eth.rss', isProfile)).toEqual({ kind: 'profile', handle: 'mal.eth' });
    expect(rssFeedRoute('/tags/Music.rss', isProfile)).toEqual({ kind: 'tag', tag: 'music' });
    expect(rssFeedRoute('/tags/%23Gaming.rss', isProfile)).toEqual({ kind: 'tag', tag: 'gaming' });
  });

  it('leaves routes, files and odd tags alone', () => {
    expect(rssFeedRoute('/docs.rss', isProfile)).toBeNull();
    expect(rssFeedRoute('/rss.xml', isProfile)).toBeNull();
    expect(rssFeedRoute('/maldoteth', isProfile)).toBeNull();
    expect(rssFeedRoute('/a/b.rss', isProfile)).toBeNull();
    expect(rssFeedRoute('/tags/not%20a%20tag.rss', isProfile)).toBeNull();
  });

  it('builds the advertised URL from the bare handle', () => {
    expect(profileFeedUrl('https://dehub.io', '@maldoteth')).toBe('https://dehub.io/maldoteth.rss');
  });
});

describe('what a feed carries', () => {
  it('keeps out anything a signed-out visitor cannot already see', () => {
    expect(rssRowIsPublic(row(1))).toBe(true);
    expect(rssRowIsPublic(row(2, { isHidden: true }))).toBe(false);
    expect(rssRowIsPublic(row(3, { plansDetails: [{ id: 'gold' }] }))).toBe(false);
    expect(rssRowIsPublic(row(4, { streamInfo: { isPayPerView: true } }))).toBe(false);
    expect(rssRowIsPublic(row(5, { streamInfo: { isLockContent: true } }))).toBe(false);
    expect(rssRowIsPublic(row(6, { contentRating: 'mature' }))).toBe(false);
    expect(rssRowIsPublic(row(7, { minterUser: { isPrivate: true } }))).toBe(false);
  });
});

describe('profile feed', () => {
  it('serves the creator’s public posts as RSS', async () => {
    stubApi({
      rows: [
        row(12, { postType: 'video', videoUrl: 'videos/12.mp4', imageUrl: 'images/12.jpg', videoDuration: 31.4 }),
        row(11, { plansDetails: [{ id: 'gold' }] }),
        row(10, { description: 'Line one <b>bold</b> & more\n\nSecond paragraph' }),
      ],
    });
    const res = await get('https://dehub.io/maldoteth.rss');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    const xml = await res.text();
    expect(xml).toContain('<title>mal (@maldoteth) on DeHub</title>');
    expect(xml).toContain('<link>https://dehub.io/maldoteth</link>');
    expect(xml).toContain('<atom:link href="https://dehub.io/maldoteth.rss" rel="self"');
    expect(xml).toContain('<description>building DeHub.</description>');
    expect(xml).toContain('<guid isPermaLink="true">https://dehub.io/app/post/12</guid>');
    expect(xml).toContain('<guid isPermaLink="true">https://dehub.io/app/post/10</guid>');
    expect(xml).not.toContain('/app/post/11<');
    expect(xml).toContain('medium="video" duration="31"');
    expect(xml).toContain('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/12.mp4');
    expect(xml).toContain('<category>music</category>');
    expect(xml).not.toContain('<category>general</category>');
    // Captions are HTML inside the XML: escaped twice, never raw markup.
    expect(xml).toContain('&lt;p&gt;Line one &amp;lt;b&amp;gt;bold&amp;lt;/b&amp;gt; &amp;amp; more&lt;/p&gt;&lt;p&gt;Second paragraph&lt;/p&gt;');
    expect(xml).not.toContain('<b>');
    expect(feedQueries[0].get('minter')).toBe(ADDRESS);
  });

  it('answers the @ form too', async () => {
    stubApi();
    expect((await get('https://dehub.io/@maldoteth.rss')).status).toBe(200);
  });

  it('has no feed for an unknown or private account', async () => {
    stubApi({ acct: null });
    expect((await get('https://dehub.io/nobody.rss')).status).toBe(404);
    stubApi({ acct: { ...account, isPrivate: true } });
    expect((await get('https://dehub.io/maldoteth.rss')).status).toBe(404);
  });

  it('says so, rather than serving an empty feed, when the API is down', async () => {
    stubApi({ feedDown: true });
    const res = await get('https://dehub.io/maldoteth.rss');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('300');
  });
});

describe('tag feed', () => {
  it('serves every public post carrying the tag', async () => {
    stubApi();
    const res = await get('https://dehub.io/tags/Music.rss');
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<title>#music on DeHub</title>');
    expect(xml).toContain('<link>https://dehub.io/app?category=music</link>');
    expect(feedQueries[0].get('category')).toBe('music');
  });
});

describe('discovery', () => {
  it('advertises the profile feed on the crawler page', () => {
    expect(WORKER).toContain('type="application/rss+xml" title="${escHtml(`${account.displayName || feedHandle} on DeHub`)}" href="${escHtml(profileFeedUrl(APP_URL, feedHandle))}"');
  });
});
