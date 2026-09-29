/**
 * Communities, stores, events, packs, creator flows, proposals and feature
 * requests all had crawler pages and no sitemap; the index stamped every child
 * with the day of the request; and any /sitemap-posts-<n>.xml started a
 * twenty-second feed walk. These pin the replacements: each entity sitemap
 * admits only what its page builder would let Google index, the index dates
 * each child by its newest row and leaves out an empty one, post and profile
 * rows carry their picture when it is already known, and every file parses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  entitySitemapXml,
  postSitemapXml,
  profileSitemapXml,
  sitemapIndexXml,
} from '../../CLOUDFLARE_WORKER_SEO.js';

const WORKER = readFileSync(resolve(__dirname, '../../CLOUDFLARE_WORKER_SEO.js'), 'utf8');

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
function parses(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror').length, xml.slice(0, 300)).toBe(0);
  return doc;
}
const TEXT = 'A community for people who film long walks through cities at night, with tips on gear.';

describe('entity sitemaps', () => {
  it('bounties: live ones only, by the page builder’s own rule', () => {
    const xml = entitySitemapXml('bounties', [[
      { job_number: 1, status: 'open', updated_at: '2026-09-20T10:00:00Z', cover_image_url: 'https://cdn.example/b1.jpg' },
      { job_number: 2, status: 'in_progress', updated_at: '2026-09-21T10:00:00Z' },
      { job_number: 3, status: 'completed', updated_at: '2026-09-22T10:00:00Z' },
    ]]);
    parses(xml);
    expect(locs(xml)).toEqual(['https://dehub.io/bounty/1', 'https://dehub.io/bounty/2']);
    expect(xml).toContain('<image:image><image:loc>https://cdn.example/b1.jpg</image:loc></image:image>');
    expect(xml).toContain('<lastmod>2026-09-20</lastmod>');
    expect(WORKER).toMatch(/entry: \(j\) => \(isBountyIndexable\(j\)/);
  });

  it('communities: public, with a sentence of description or a few members, at the canonical /app URL', () => {
    const xml = entitySitemapXml('communities', [[
      { slug: 'night-walks', description: TEXT, member_count: 1, updated_at: '2026-09-01T00:00:00Z' },
      { slug: 'busy', description: '', member_count: 12, updated_at: '2026-09-02T00:00:00Z' },
      { slug: 'empty', description: 'hi', member_count: 1, updated_at: '2026-09-03T00:00:00Z' },
      { slug: 'join', description: TEXT, member_count: 50 },
    ]]);
    parses(xml);
    expect(locs(xml)).toEqual(['https://dehub.io/app/communities/night-walks', 'https://dehub.io/app/communities/busy']);
    expect(WORKER).toContain("query: () => 'communities?is_private=eq.false");
  });

  it('stores: named live stores and the active items of live stores', () => {
    const xml = entitySitemapXml('stores', [
      [
        { id: 'aaaaaaaa-1111', name: 'Prints', banner_url: 'https://cdn.example/s.jpg?w=1&h=2', updated_at: '2026-08-01T00:00:00Z' },
        { id: 'bbbbbbbb-2222', name: '  ', updated_at: '2026-08-02T00:00:00Z' },
      ],
      [{ id: 'cccccccc-3333', store_id: 'aaaaaaaa-1111', images: ['https://cdn.example/i.jpg'], updated_at: '2026-09-05T00:00:00Z' }],
    ]);
    parses(xml);
    expect(locs(xml)).toEqual([
      'https://dehub.io/stores/aaaaaaaa-1111',
      'https://dehub.io/stores/aaaaaaaa-1111?listing=cccccccc-3333',
    ]);
    // Image URLs are escaped, or one ampersand invalidates the whole file.
    expect(xml).toContain('<image:loc>https://cdn.example/s.jpg?w=1&amp;h=2</image:loc>');
    expect(xml).toContain('<image:loc>https://cdn.example/i.jpg</image:loc>');
    expect(WORKER).toContain("query: () => 'stores?is_active=eq.true");
    expect(WORKER).toContain('store_listings?status=eq.active');
  });

  it('events: public and upcoming only', () => {
    const xml = entitySitemapXml('events', [[{ event_number: 7, created_at: '2026-09-10T00:00:00Z' }]]);
    parses(xml);
    expect(locs(xml)).toEqual(['https://dehub.io/app/events/7']);
    const query = WORKER.slice(WORKER.indexOf('  events: [{'), WORKER.indexOf('  packs: [{'));
    expect(query).toContain('is_private=eq.false');
    expect(query).toContain('starts_at.gte.');
    expect(query).toContain('ends_at.gte.');
  });

  it('packs and flows: only ids the route itself would answer', () => {
    const packs = entitySitemapXml('packs', [[{ slug: 'Cats_1', updated_at: '2026-09-01' }, { slug: 'x' }]]);
    parses(packs);
    expect(locs(packs)).toEqual(['https://dehub.io/packs/cats_1']);
    const flows = entitySitemapXml('flows', [[{ id: 'abc123def', updated_at: '2026-09-01' }, { id: 'NOT-VALID' }]]);
    parses(flows);
    expect(locs(flows)).toEqual(['https://dehub.io/creator/flow/abc123def']);
    expect(WORKER).toContain('creator_flows?is_public=eq.true');
  });

  it('proposals and feature requests: a sentence of text, and never a declined request', () => {
    const proposals = entitySitemapXml('proposals', [[
      { id: 'p1', title: 'Fund a creator grant', description: TEXT, updated_at: '2026-09-01' },
      { id: 'p2', title: 'hi', description: '' },
    ]]);
    parses(proposals);
    expect(locs(proposals)).toEqual(['https://dehub.io/app/governance/p1']);
    const features = entitySitemapXml('features', [[
      { id: 'f1', title: 'Dark mode for Stages', description: TEXT, status: 'open', updated_at: '2026-09-01' },
      { id: 'f2', title: 'Dark mode for Stages', description: TEXT, status: 'declined' },
      { id: 'f3', title: 'bug', description: 'broken', status: 'open' },
    ]]);
    parses(features);
    expect(locs(features)).toEqual(['https://dehub.io/features?feature=f1']);
  });

  it('is a valid, empty urlset when a table has no rows', () => {
    for (const kind of ['bounties', 'communities', 'stores', 'events', 'packs', 'flows', 'proposals', 'features']) {
      const xml = entitySitemapXml(kind, [[], []]);
      parses(xml);
      expect(locs(xml), kind).toEqual([]);
    }
  });

  it('has no stages sitemap: a stage is noindex the moment it ends', () => {
    expect(entitySitemapXml('stages', [[{ short_id: 1 }]])).toBeNull();
  });
});

describe('the sitemap index', () => {
  const xml = sitemapIndexXml([
    { loc: 'https://dehub.io/sitemap-static.xml', lastmod: '2026-09-28T00:00:00.000Z' },
    { loc: 'https://dehub.io/sitemap-posts-1.xml', lastmod: '' },
    { loc: 'https://dehub.io/sitemap-bounties.xml', lastmod: '2026-09-22' },
  ]);

  it('parses and carries each child’s own date, or none', () => {
    parses(xml);
    expect(xml).toContain('<sitemap><loc>https://dehub.io/sitemap-static.xml</loc><lastmod>2026-09-28</lastmod></sitemap>');
    expect(xml).toContain('<sitemap><loc>https://dehub.io/sitemap-posts-1.xml</loc></sitemap>');
    expect(xml).toContain('<lastmod>2026-09-22</lastmod>');
  });

  it('is built from real dates and leaves out an empty entity sitemap', () => {
    const build = WORKER.slice(WORKER.indexOf('async function buildSitemapIndex('));
    expect(build).toContain('lastmod: sitemapSummary(staticXml).lastmod');
    expect(build).toContain('if (summary && summary.count === 0) continue;');
    expect(build).toContain('await cachedSitemapLastmod(loc)');
    expect(build.slice(0, build.indexOf('\n}\n'))).not.toMatch(/new Date\(\)\.toISOString\(\)/);
  });
});

describe('post and profile rows', () => {
  const text = 'A long enough caption to clear the sitemap quality bar easily.';

  it('post rows carry the post picture, moved off the dead nfts/ path and transformed like the share card', () => {
    const xml = postSitemapXml([
      { tokenId: 5, name: text, createdAt: '2026-09-01T00:00:00Z', imageUrl: 'nfts/images/5.jpg' },
      { tokenId: 6, name: text, createdAt: '2026-09-02T00:00:00Z', imageUrl: 'images/6.png' },
      { tokenId: 7, name: text, createdAt: '2026-09-03T00:00:00Z' },
    ]);
    parses(xml);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain(
      '<loc>https://dehub.io/app/post/5</loc><lastmod>2026-09-01</lastmod><changefreq>weekly</changefreq><priority>0.6</priority>'
      + '<image:image><image:loc>https://dehub.io/cdn-cgi/image/format=jpeg,width=1200,fit=scale-down/https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/5.jpg</image:loc></image:image>',
    );
    expect(xml).toContain('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/6.png</image:loc>');
    expect(xml).toContain('<loc>https://dehub.io/app/post/7</loc><lastmod>2026-09-03</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>');
  });

  it('profile rows carry an avatar only when the API row has one', () => {
    const xml = profileSitemapXml(
      [
        { username: 'alice', lastmod: '2026-09-01', avatarUrl: 'avatars/0xabc.jpg' },
        { username: 'bob', lastmod: '2026-09-02' },
      ],
      new Set(),
    );
    parses(xml);
    expect(xml).toContain('/avatars/0xabc.jpg</image:loc>');
    expect(xml).toContain('<loc>https://dehub.io/bob</loc><lastmod>2026-09-02</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>');
  });
});

describe('wiring', () => {
  const handler = WORKER.slice(WORKER.indexOf('const sitemapRequest = new Request('));
  const proxy = handler.indexOf('const sitemapMatch =');

  it('answers the index and every entity sitemap before the Supabase proxy', () => {
    expect(handler.indexOf("if (pathname === '/sitemap.xml') {")).toBeGreaterThan(-1);
    expect(handler.indexOf("if (pathname === '/sitemap.xml') {")).toBeLessThan(proxy);
    expect(handler.indexOf('Object.hasOwn(ENTITY_SITEMAPS, entitySitemapMatch[1])')).toBeLessThan(proxy);
    expect(handler).toContain('cachedSitemap(sitemapRequest, ctx, () => buildEntitySitemap(kind))');
  });

  it('builds a posts page only when posts can be on it', () => {
    const posts = handler.slice(handler.indexOf('const postSitemapMatch'), proxy);
    expect(posts).toContain('await newestPostId()');
    expect(posts.indexOf('return sitemapNotFound();')).toBeLessThan(posts.indexOf('cachedSitemap('));
  });

  it('caches every sitemap under its bare URL, so a query string cannot force a rebuild', () => {
    expect(handler).toContain('const sitemapRequest = new Request(`${url.origin}${pathname}`);');
    expect(handler.slice(0, proxy)).not.toMatch(/cachedSitemap\(request,/);
  });
});
