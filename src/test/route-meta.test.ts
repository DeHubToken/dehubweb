/**
 * The app's head tags must say what the worker's crawler pages say for the
 * same URL. They did not: /explore declared https://dehub.io/app/explore while
 * the worker declared /explore for /app/explore, two canonicals pointing at
 * each other, and /videos and /shorts carried the home page's H1.
 *
 * lib/seo/route-meta mirrors the worker's rules; this reads the worker source
 * and fails when either side moves without the other.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BARE_CANONICAL_KEYS, HUB_ROUTE_META, canonicalPath, canonicalUrl } from '@/lib/seo/route-meta';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const EN = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/locales/en.json'), 'utf8'));

/** Line comments out: the Set bodies carry prose with quoted route names in it. */
const stripComments = (s: string) => s.replace(/^\s*\/\/.*$/gm, '');

function setKeys(name: string): string[] {
  const start = WORKER.indexOf(`const ${name} = new Set([`);
  expect(start).toBeGreaterThan(-1);
  const body = stripComments(WORKER.slice(start, WORKER.indexOf(']);', start)));
  return body.match(/'[^']+'/g)!.map((s) => s.slice(1, -1));
}

function tableBody(name: string): string {
  const start = WORKER.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n};', start));
}

const tableKeys = (name: string) =>
  [...tableBody(name).matchAll(/^ {2}'?([\w/-]+)'?: \{/gm)].map((m) => m[1]);

const workerConst = (name: string) => WORKER.match(new RegExp(`const ${name} = '([^']+)';`))![1];

describe('canonical rules match the worker', () => {
  it('collapses exactly the worker-rendered /app twins onto the bare path', () => {
    const worker = new Set([
      ...setKeys('SSR_STATIC_ROUTES'),
      ...tableKeys('SECTION_PAGES'),
      ...tableKeys('MARKETING_PAGES'),
    ]);
    expect([...BARE_CANONICAL_KEYS].sort()).toEqual([...worker].sort());
  });

  it.each([
    ['/app/explore', '/explore'],
    ['/explore/', '/explore'],
    ['/Explore', '/explore'],
    ['/app/music', '/music'],
    ['/app/videos', '/videos'],
    ['/app/tv', '/tv'],
    ['/app/arcade/gods-eye', '/arcade/gods-eye'],
    ['/app/communities', '/communities'],
    ['/', '/'],
    ['/app', '/app'],
    ['/aaron', '/aaron'],
    ['/app/bookmarks', '/app/bookmarks'],
    ['/app/events/12', '/app/events/12'],
    ['/app/governance/abc', '/app/governance/abc'],
  ])('%s -> %s', (from, to) => {
    expect(canonicalPath(from)).toBe(to);
  });

  // The worker normalises every post shape onto /app/post/<tokenId> before the
  // Supabase fn renders it, and that fn's canonical is the /app twin.
  it.each([
    ['/app/post/42', '/app/post/42'],
    ['/post/42', '/app/post/42'],
    ['/posts/42', '/app/post/42'],
    ['/posts/42/b', '/app/post/42'],
    ['/posts/42/b/some-title', '/app/post/42'],
    ['/video/42', '/app/post/42'],
    ['/app/video/42', '/app/post/42'],
    ['/app/post/42/info', '/app/post/42/info'],
  ])('post %s -> %s', (from, to) => {
    expect(canonicalPath(from)).toBe(to);
  });

  it('collapses entity twins the way the worker canonicalises them', () => {
    expect(canonicalPath('/communities/dehub-wave')).toBe('/app/communities/dehub-wave');
    expect(canonicalPath('/app/communities/dehub-wave')).toBe('/app/communities/dehub-wave');
    // Invite links are not a community page; the worker leaves them alone.
    expect(canonicalPath('/communities/join/abc123')).toBe('/communities/join/abc123');
    expect(canonicalPath('/app/stores/abc')).toBe('/stores/abc');
    expect(canonicalPath('/cinema/film/tt123')).toBe('/cinema');
    expect(canonicalPath('/cinema/series/abc-def')).toBe('/cinema');
  });

  it('agrees with the entity canonicals the worker builds', () => {
    expect(WORKER).toContain('const canonicalUrl = `${APP_URL}/stores/${store.id}`;');
    expect(WORKER).toContain('ssrPath = `/app/post/${shortPostPath[1]}`;');
    expect(WORKER).toContain('ssrPath = `/app/communities/${bareCommunity[1]}`;');
    expect(WORKER).toMatch(/canonicalize onto \/cinema/);
  });

  it('normalises explicit dehub.io URLs and leaves other hosts alone', () => {
    expect(canonicalUrl('https://dehub.io/app/explore')).toBe('https://dehub.io/explore');
    expect(canonicalUrl('https://dehub.io/app/music')).toBe('https://dehub.io/music');
    expect(canonicalUrl('https://dehub.io/features?feature=abc')).toBe('https://dehub.io/features?feature=abc');
    expect(canonicalUrl('/posts/7/b')).toBe('https://dehub.io/app/post/7');
    expect(canonicalUrl('https://example.com/app/explore')).toBe('https://example.com/app/explore');
  });
});

describe('hub head strings match the worker', () => {
  const t = (key: string) => key.split('.').reduce((o, k) => o?.[k], EN) as unknown as string;

  it('home', () => {
    expect(t(HUB_ROUTE_META.home.titleKey)).toBe(workerConst('HOME_TITLE'));
    expect(t(HUB_ROUTE_META.home.descriptionKey)).toBe(workerConst('HOME_DESCRIPTION'));
    expect(HUB_ROUTE_META.home.url).toBe('https://dehub.io/');
  });

  it.each(['explore', 'videos', 'shorts'] as const)('%s', (key) => {
    const body = tableBody('SECTION_PAGES');
    const m = body.match(
      new RegExp(`\\n  ${key}: \\{\\n    title: '([^']+)',\\n    heading: '([^']+)',\\n    description: '([^']+)'`),
    );
    expect(m, `SECTION_PAGES.${key} shape changed`).toBeTruthy();
    const meta = HUB_ROUTE_META[key];
    expect(t(meta.titleKey)).toBe(m![1]);
    expect(t(meta.descriptionKey)).toBe(m![3]);
    if ('headingKey' in meta) expect(t(meta.headingKey)).toBe(m![2]);
    expect(meta.url).toBe(`https://dehub.io/${key}`);
  });

  it('docs index', () => {
    const body = WORKER.slice(WORKER.indexOf('function buildDocsIndexHtml'));
    const title = body.match(/<title>([^<]+)<\/title>/)![1].replace(/&amp;/g, '&');
    const raw = body.match(/<meta name="description" content="([^"]+)">/)![1];
    // The worker may inline the string or name a constant for it.
    const constant = raw.match(/^\$\{(\w+)\}$/);
    const description = constant ? workerConst(constant[1]) : raw;
    expect(t(HUB_ROUTE_META.docs.titleKey)).toBe(title);
    expect(t(HUB_ROUTE_META.docs.descriptionKey)).toBe(description);
  });

  it('is what the pages render', () => {
    const home = readFileSync(resolve(ROOT, 'src/pages/app/HomePage.tsx'), 'utf8');
    const explore = readFileSync(resolve(ROOT, 'src/pages/app/ExplorePage.tsx'), 'utf8');
    for (const key of ['home.seoTitle', 'home.seoDescription', 'videos.seoTitle', 'videos.seoDescription', 'videos.heading', 'shorts.seoTitle', 'shorts.seoDescription', 'shorts.heading']) {
      expect(home).toContain(`t('${key}')`);
    }
    expect(explore).toContain(`t('explore.seoTitle')`);
    expect(explore).toContain(`t('explore.seoDescription')`);
    // The home H1 was reused on /videos and /shorts.
    expect(home).not.toContain('Your Decentralized Social Feed');
  });
});
