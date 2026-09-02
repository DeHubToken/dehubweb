/**
 * Crawler HTML for posts and profiles is proxied from the deployed `ssr-seo`
 * Supabase function and patched on the way out (proxied-meta-normalisation
 * .test.ts says why). This covers the newest patch: the fn describes a
 * bodyless post as `Post by <author> on DeHub — join the decentralized
 * creator network.` and a bio-less profile as `Connect with <name> on DeHub,
 * the open source alternative to legacy media.`, so every such page by one
 * author carried the same description — 128 of 400 posts in the 2026-09-02
 * sitemap crawl, 33 of them one account's. The rewrite builds one from what
 * the page actually is; these pin that it is unique, bounded, escaped for
 * both the attribute and the JSON-LD context, and absent where the fn had
 * real copy.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/** A whole declaration, never a byte window (the bounty-urls.test.ts lesson). */
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

type Nft = { postType?: string; category?: string[] } | null;

const { enrichPostMeta, enrichProfileMeta, DESCRIPTION_MAX, HOME_DESCRIPTION, PROFILE_DESCRIPTION_MIN } = new Function(`
  ${constant('TITLE_MAX')}
  ${constant('DESCRIPTION_MAX')}
  ${constant('POST_DESCRIPTION_TEMPLATE')}
  ${constant('PROFILE_DESCRIPTION_TEMPLATE')}
  ${constant('PROFILE_DESCRIPTION_MIN')}
  ${constant('UNTITLED_POST_TITLES')}
  ${constant('HOME_DESCRIPTION')}
  ${decl('function truncate(text, max) {')}
  ${decl('function decodeFnText(s) {')}
  ${decl('function escFnAttr(s) {')}
  ${decl('function escJsonText(s) {')}
  ${decl('function postKind(nft, html) {')}
  ${decl('function enrichPostMeta(html, postId, nft) {')}
  ${decl('function enrichProfileMeta(html, username) {')}
  return { enrichPostMeta, enrichProfileMeta, DESCRIPTION_MAX, HOME_DESCRIPTION, PROFILE_DESCRIPTION_MIN };
`)() as {
  enrichPostMeta: (html: string, postId: string, nft: Nft) => string;
  enrichProfileMeta: (html: string, username: string) => string;
  DESCRIPTION_MAX: number;
  HOME_DESCRIPTION: string;
  PROFILE_DESCRIPTION_MIN: number;
};

/** Exactly the fn's attribute escaping: `"`, `<`, `>` and nothing else. */
const attr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const POST_TEMPLATE = (author: string) => `Post by ${author} on DeHub — join the decentralized creator network.`;
const PROFILE_TEMPLATE = (name: string) => `Connect with ${name} on DeHub, the open source alternative to legacy media.`;

/** The shape the deployed fn emits for a post, trimmed to the tags in play. */
const postPage = (id: string, title: string, description: string, video = true) => `<!DOCTYPE html>
<html lang="en">
<head>
  <title>${attr(title)}</title>
  <meta name="description" content="${attr(description)}">
  <link rel="canonical" href="https://dehub.io/app/post/${id}">
  <meta property="og:type" content="${video ? 'video.other' : 'article'}">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:image" content="https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/${id}.jpg">
  <meta property="og:image:alt" content="${attr(title)}">
${video ? `  <meta property="og:video" content="https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${id}.mp4">\n` : ''}  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(description)}">
  <meta name="twitter:image:alt" content="${attr(title)}">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: title, description, url: `https://dehub.io/app/post/${id}` },
      { '@type': 'VideoObject', name: title, description },
    ],
  })}</script>
</head>
</html>`;

const profilePage = (handle: string, description: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <title>@${handle} on DeHub — posts, videos &amp; profile</title>
  <meta name="description" content="${attr(description)}">
  <link rel="canonical" href="https://dehub.io/${handle}">
  <meta property="og:description" content="${attr(description)}">
  <meta name="twitter:description" content="${attr(description)}">
</head>
</html>`;

const valueOf = (html: string, tag: string) =>
  tag === 'title'
    ? html.match(/<title>([\s\S]*?)<\/title>/)![1]
    : html.match(new RegExp(`(?:property|name)="${tag}" content="([\\s\\S]*?)">`))![1];

const jsonLd = (html: string) =>
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);

const TITLE_TAGS = ['title', 'og:title', 'og:image:alt', 'twitter:title', 'twitter:image:alt'];
const DESCRIPTION_TAGS = ['description', 'og:description', 'twitter:description'];

const VIDEO: Nft = {
  postType: 'video',
  category: ['business', 'entrepreneurship', 'professional development', 'marketing', 'industry insight'],
};

describe('post description enrichment', () => {
  it('leaves a post that has its own body text exactly as it was', () => {
    const html = postPage('2008', 'Last Chad Standing', 'Built by fighters and gamers. Coming 2025.');
    expect(enrichPostMeta(html, '2008', VIDEO)).toBe(html);
  });

  it('replaces the per-author template with title, format, author and topics — every tag, both JSON-LD nodes', () => {
    const out = enrichPostMeta(postPage('3052', 'Business', POST_TEMPLATE('LiberoArbitro')), '3052', VIDEO);
    expect(out).not.toContain('join the decentralized creator network');
    for (const tag of DESCRIPTION_TAGS) {
      const v = valueOf(out, tag);
      expect(v).toContain('Watch &quot;Business&quot; — a video by LiberoArbitro on DeHub');
      expect(v).toContain('Topics: business, entrepreneurship');
    }
    const ld = jsonLd(out);
    expect(ld['@graph'][0].description).toContain('Watch "Business" — a video by LiberoArbitro on DeHub');
    expect(ld['@graph'][1].description).toBe(ld['@graph'][0].description);
    expect(ld['@graph'][0].description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    for (const tag of TITLE_TAGS) expect(valueOf(out, tag)).toBe('Business');
    expect(ld['@graph'][0].headline).toBe('Business');
  });

  it('gives two bodyless posts by one author different descriptions', () => {
    const a = enrichPostMeta(postPage('3052', 'Business', POST_TEMPLATE('LiberoArbitro')), '3052', VIDEO);
    const b = enrichPostMeta(
      postPage('3073', 'Markets today', POST_TEMPLATE('LiberoArbitro')),
      '3073',
      { postType: 'video', category: ['finance'] },
    );
    expect(valueOf(a, 'description')).not.toBe(valueOf(b, 'description'));
  });

  it('still rewrites when the post record could not be fetched, reading the format off og:video', () => {
    const video = enrichPostMeta(postPage('3052', 'Business', POST_TEMPLATE('LiberoArbitro')), '3052', null);
    expect(valueOf(video, 'description')).toContain('a video by LiberoArbitro');
    expect(valueOf(video, 'description')).not.toContain('Topics:');
    const text = enrichPostMeta(postPage('77', 'Hello', POST_TEMPLATE('X'), false), '77', null);
    expect(valueOf(text, 'description')).toContain('Read &quot;Hello&quot; — a post by X on DeHub');
  });

  it('names the format from the record for audio and photo posts', () => {
    const audio = enrichPostMeta(postPage('1', 'Set', POST_TEMPLATE('DJ'), false), '1', { postType: 'feed-audio' });
    expect(valueOf(audio, 'description')).toContain('Listen to &quot;Set&quot; — an audio post by DJ');
    const photo = enrichPostMeta(postPage('2', 'Pic', POST_TEMPLATE('P'), false), '2', { postType: 'feed-images' });
    expect(valueOf(photo, 'description')).toContain('See &quot;Pic&quot; — a photo post by P');
  });

  it('retitles an "Untitled" upload so siblings from one account stop sharing a <title>', () => {
    const out = enrichPostMeta(
      postPage('3145', 'Untitled', POST_TEMPLATE('A&K1618')),
      '3145',
      { postType: 'video', category: ['cars'] },
    );
    for (const tag of TITLE_TAGS) expect(valueOf(out, tag)).toBe('Video #3145 by A&K1618 on DeHub');
    const ld = jsonLd(out);
    expect(ld['@graph'][0].headline).toBe('Video #3145 by A&K1618 on DeHub');
    expect(ld['@graph'][1].name).toBe('Video #3145 by A&K1618 on DeHub');
    expect(valueOf(out, 'description')).toBe(
      'Watch video #3145 by A&K1618 on DeHub, the open source, user-owned social network. Topics: cars.',
    );
  });

  it('caps the description and escapes it for each context', () => {
    const title = `Price is $1 & "cheap" <now> ${'x'.repeat(40)}`;
    const out = enrichPostMeta(postPage('9', title, POST_TEMPLATE('Q "the" <Seller>')), '9', {
      postType: 'video',
      category: Array.from({ length: 5 }, (_, i) => `topic number ${i} with a long name`),
    });
    const ld = jsonLd(out);
    expect(ld['@graph'][0].description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(ld['@graph'][0].description).toContain('Watch "Price is $1 & "cheap" <now>');
    expect(ld['@graph'][0].description).toContain('by Q "the" <Seller> on DeHub');
    const v = valueOf(out, 'description');
    expect(v).toContain('&quot;cheap&quot; &lt;now&gt;');
    expect(v).not.toMatch(/[<>]/);
    // "$1" in the copy must never be read as a replacement pattern.
    expect(v).toContain('$1');
  });
});

describe('profile description enrichment', () => {
  it('adds the handle to the bio-less template so two accounts with one display name differ', () => {
    const a = enrichProfileMeta(profilePage('shubham223', PROFILE_TEMPLATE('shubham')), 'shubham223');
    const b = enrichProfileMeta(profilePage('shubham_new2', PROFILE_TEMPLATE('shubham')), 'shubham_new2');
    for (const tag of DESCRIPTION_TAGS) {
      expect(valueOf(a, tag)).toContain('Connect with shubham (@shubham223) on DeHub');
    }
    expect(valueOf(a, 'description')).not.toBe(valueOf(b, 'description'));
    expect(a).not.toContain('open source alternative to legacy media');
  });

  it('does not repeat a display name that is just the handle', () => {
    const out = enrichProfileMeta(profilePage('aaron', PROFILE_TEMPLATE('aaron')), 'aaron');
    expect(valueOf(out, 'description')).toMatch(/^Connect with @aaron on DeHub/);
  });

  it('appends the handle to a bio too short to describe the page, and leaves a real bio alone', () => {
    const short = enrichProfileMeta(profilePage('lcfc', 'DHB ❤'), 'lcfc');
    expect(valueOf(short, 'description')).toBe('DHB ❤ — @lcfc on DeHub, the open source, user-owned social network.');
    const bio = 'Football, crypto and coffee. Building on DeHub since 2023, one clip at a time.';
    expect(bio.length).toBeGreaterThanOrEqual(PROFILE_DESCRIPTION_MIN);
    const long = profilePage('fan', bio);
    expect(enrichProfileMeta(long, 'fan')).toBe(long);
  });
});

describe('homepage description', () => {
  it('is the sentence index.html carries, so the bot and browser variants agree', () => {
    const browser = INDEX_HTML.match(/<meta name="description" content="([^"]*)">/)![1];
    expect(HOME_DESCRIPTION).toBe(browser);
  });
});

describe('wiring', () => {
  it('runs after normalisation and before the card swap; the homepage rewrite sits by the title alignment', () => {
    const normalise = WORKER.indexOf('html = normalizeProxiedMeta(html);');
    const post = WORKER.indexOf('html = enrichPostMeta(html,');
    const profile = WORKER.indexOf('html = enrichProfileMeta(html,');
    const cardSwap = WORKER.indexOf('const cardKey = ');
    expect(normalise).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(normalise);
    expect(profile).toBeGreaterThan(post);
    expect(cardSwap).toBeGreaterThan(profile);
    const titleAlign = WORKER.indexOf('html = html.replaceAll(HOME_TITLE_LEGACY, HOME_TITLE);');
    const descAlign = WORKER.indexOf('escFnAttr(HOME_DESCRIPTION)');
    expect(titleAlign).toBeGreaterThan(-1);
    expect(descAlign).toBeGreaterThan(titleAlign);
  });
});
