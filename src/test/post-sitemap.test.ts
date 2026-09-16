// @vitest-environment node
/**
 * `/sitemap-posts-1.xml` offered Google every minted post — 3,299 of them — and
 * Google answered by putting 4,441 post URLs in "Crawled - currently not
 * indexed" and another 851 in "Discovered". It had fetched them, found a
 * caption and a view count, and declined. Measured over 1,200 live posts on
 * 2026-09-16: 44% carry fewer than 15 characters of letters and digits across
 * title and body, 10% carry none, and 81% have no comments.
 *
 * So the list is filtered now, and the filter is the whole point of the file:
 * it is invisible in any single response, and the only report on getting it
 * wrong is a coverage number weeks later. Both directions are pinned here —
 * what must be dropped, and what must survive — because a bar that quietly
 * rejects everything looks exactly like a bar that works.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { postQualifiesForSitemap, postSitemapXml } from '../../CLOUDFLARE_WORKER_SEO.js';

const WORKER = readFileSync(resolve(__dirname, '../../CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const locs = (xml: string) => Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

/** A caption long enough to clear the bar on its own. */
const REAL_CAPTION = 'Good morning, valued DeHub family, here is what shipped';

describe('postQualifiesForSitemap', () => {
  it('keeps a post whose title or body says something', () => {
    expect(postQualifiesForSitemap({ tokenId: 1, name: REAL_CAPTION })).toBe(true);
    expect(postQualifiesForSitemap({ tokenId: 2, name: '😂', description: REAL_CAPTION })).toBe(true);
  });

  it('drops a caption too short to answer any query', () => {
    for (const name of ['Hop!!!!!!!;', 'Mofo’s 😂🤣', 'test', '', 'gm']) {
      expect(postQualifiesForSitemap({ tokenId: 3, name }), name).toBe(false);
    }
  });

  it('counts only letters and digits, so an emoji wall is not text', () => {
    expect(postQualifiesForSitemap({ tokenId: 4, name: '😂'.repeat(40) })).toBe(false);
    expect(postQualifiesForSitemap({ tokenId: 5, name: '!'.repeat(80) })).toBe(false);
  });

  it('keeps a thin post that carries a real conversation', () => {
    // The crawler HTML renders comments, so they are the page's substance when
    // the caption is not. Two is chatter; three is a thread.
    expect(postQualifiesForSitemap({ tokenId: 6, name: 'Hop!', commentCount: 3 })).toBe(true);
    expect(postQualifiesForSitemap({ tokenId: 7, name: 'Hop!', commentCount: 2 })).toBe(false);
  });

  it('never submits a page a signed-out crawler cannot see', () => {
    const base = { tokenId: 8, name: REAL_CAPTION };
    expect(postQualifiesForSitemap({ ...base, isHidden: true })).toBe(false);
    expect(postQualifiesForSitemap({ ...base, isPrivate: true })).toBe(false);
    expect(postQualifiesForSitemap({ ...base, plansDetails: [{ id: 'plan' }] })).toBe(false);
    // An empty plans array is not a paywall.
    expect(postQualifiesForSitemap({ ...base, plansDetails: [] })).toBe(true);
  });

  it('does not test status: the feed ignores its own status filter', () => {
    // 308 of 1,200 rows came back `signed` from a query that asked for
    // `status=minted`, and all eight sampled `signed` posts answer 200 at
    // /app/post/<tokenId> — minting is optional. Rejecting them would drop a
    // quarter of the corpus over a distinction the page does not make.
    expect(postQualifiesForSitemap({ tokenId: 9, name: REAL_CAPTION, status: 'signed' })).toBe(true);
    expect(WORKER).not.toMatch(/postQualifiesForSitemap[\s\S]{0,600}?status[\s\S]{0,40}!==\s*'minted'/);
  });
});

describe('postSitemapXml', () => {
  const posts = [
    { tokenId: 30, name: REAL_CAPTION, createdAt: '2026-08-12T10:00:00.000Z' },
    { tokenId: 10, name: REAL_CAPTION, createdAt: '2026-08-11T10:00:00.000Z' },
    { tokenId: 20, name: 'nope' },
  ];

  it('emits qualifying posts only, at the canonical URL, lowest id first', () => {
    expect(locs(postSitemapXml(posts))).toEqual([
      'https://dehub.io/app/post/10',
      'https://dehub.io/app/post/30',
    ]);
  });

  it('de-duplicates on id, so one post cannot be submitted twice', () => {
    const xml = postSitemapXml([
      { tokenId: 41, name: REAL_CAPTION },
      { tokenId: 41, name: REAL_CAPTION },
    ]);
    expect(locs(xml)).toEqual(['https://dehub.io/app/post/41']);
  });

  it('writes lastmod as a bare date, and omits it rather than emit a bad one', () => {
    expect(postSitemapXml([{ tokenId: 1, name: REAL_CAPTION, createdAt: '2026-08-12T10:00:00.000Z' }]))
      .toContain('<lastmod>2026-08-12</lastmod>');
    // A malformed lastmod invalidates the whole file for some parsers; the date
    // is the least important thing in the entry.
    for (const createdAt of ['yesterday', '', null, undefined, 12345]) {
      expect(postSitemapXml([{ tokenId: 1, name: REAL_CAPTION, createdAt }])).not.toContain('<lastmod>');
    }
  });

  it('stays well-formed when nothing qualifies', () => {
    const xml = postSitemapXml([{ tokenId: 1, name: 'gm' }]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    expect(locs(xml)).toEqual([]);
  });

  it('ignores rows with no usable id', () => {
    expect(locs(postSitemapXml([
      { name: REAL_CAPTION },
      { tokenId: 'abc', name: REAL_CAPTION },
      { tokenId: 7, name: REAL_CAPTION },
    ]))).toEqual(['https://dehub.io/app/post/7']);
  });
});

/**
 * The helper passing is not evidence the helper runs — #1409 shipped a green
 * suite and a clean deploy and changed nothing, because the call site had its
 * own gate. These read the wiring.
 */
describe('the posts sitemap is wired at the edge', () => {
  const handler = WORKER.slice(WORKER.indexOf('const postSitemapMatch'));

  it('serves /sitemap-posts-N.xml from the filtered builder', () => {
    expect(handler).toMatch(/dehubPostSitemap\(Number\(postSitemapMatch\[1\]\)/);
    expect(handler.slice(0, handler.indexOf('const sitemapMatch'))).toContain('postSitemapXml(posts)');
  });

  it('runs before the Supabase proxy, and falls back to it rather than publishing a partial file', () => {
    // An incomplete walk returns null. A truncated sitemap is a 200 the edge
    // caches for an hour that tells Google the posts it omits were removed.
    expect(WORKER.indexOf('const postSitemapMatch')).toBeLessThan(WORKER.indexOf('const sitemapMatch'));
    expect(handler).toMatch(/if \(posts\) \{/);
    expect(WORKER).toMatch(/async function dehubPostSitemap[\s\S]*?return complete \? posts : null;|async function dehubPostSitemap[\s\S]*?return null;\n\}/);
  });

  it('asks the feed for a stable order, or pages shift under the walk', () => {
    expect(WORKER).toContain('sortBy=createdAt&sortOrder=desc');
  });
});
