/**
 * `/sitemap-profiles-1.xml` shipped 50 URLs against ~3,500 registered
 * accounts, because it was built from `suggested_profiles_cache` — the fifty
 * rows behind the "who to follow" rail, reused as a census of the platform
 * because nothing on the Supabase side could see the real thing.
 *
 * The list now comes from the API. What that changes is the failure mode: a
 * sitemap of fifty hand-picked accounts could not really contain a bad URL,
 * and a sitemap of thousands can. Nothing downstream would tell us — a sitemap
 * full of 404s is served, cached and read exactly like a good one, and the only
 * report is a Search Console coverage number weeks later.
 *
 * So the two filters that stand between the API's answer and Google are pinned
 * here, along with the index patch, which is the one piece that can break every
 * other sitemap on the site if it goes wrong.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchProfileChunks, profileSitemapXml } from '../../CLOUDFLARE_WORKER_SEO.js';
import { ROUTE_SEGMENTS } from '@/lib/reserved-usernames';

const SYSTEM_ROUTES = new Set(ROUTE_SEGMENTS.map((s) => s.toLowerCase()));
const WORKER = readFileSync(resolve(__dirname, '../../CLOUDFLARE_WORKER_SEO.js'), 'utf8');

const locs = (xml: string) => Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

describe('profileSitemapXml', () => {
  it('emits one entry per profile, at the canonical URL', () => {
    const xml = profileSitemapXml(
      [{ username: 'alice', lastmod: '2026-08-01' }, { username: 'bob', lastmod: '2026-07-30' }],
      SYSTEM_ROUTES,
    );
    expect(locs(xml)).toEqual(['https://dehub.io/alice', 'https://dehub.io/bob']);
    expect(xml).toContain('<lastmod>2026-08-01</lastmod>');
  });

  /**
   * Seven accounts pre-date the reserved-name list and hold names the router
   * owns. `dehub.io/admin` serves the admin route and always will, so the
   * profile behind that name is unreachable — submitting it asks Google to
   * index a page that does not exist.
   */
  it('drops names the router owns, however real the account is', () => {
    const xml = profileSitemapXml(
      [{ username: 'admin' }, { username: 'Explore' }, { username: 'blog' }, { username: 'real' }],
      SYSTEM_ROUTES,
    );
    expect(locs(xml)).toEqual(['https://dehub.io/real']);
  });

  it('keeps a .eth handle and drops anything else with a dot', () => {
    const xml = profileSitemapXml(
      [{ username: 'mal.eth' }, { username: 'favicon.ico' }, { username: 'a.b' }],
      SYSTEM_ROUTES,
    );
    expect(locs(xml)).toEqual(['https://dehub.io/mal.eth']);
  });

  it('de-duplicates case-insensitively, because the router matches that way', () => {
    const xml = profileSitemapXml([{ username: 'Alice' }, { username: 'alice' }], SYSTEM_ROUTES);
    expect(locs(xml)).toEqual(['https://dehub.io/Alice']);
  });

  it('percent-encodes a name rather than letting it break the XML', () => {
    const xml = profileSitemapXml([{ username: 'a&b' }], SYSTEM_ROUTES);
    expect(xml).toContain('<loc>https://dehub.io/a%26b</loc>');
    expect(xml).not.toContain('a&b');
  });

  it('drops a lastmod that is not a plain date, and keeps the entry', () => {
    const xml = profileSitemapXml(
      [{ username: 'nodate', lastmod: 'yesterday' }, { username: 'nulldate', lastmod: null }],
      SYSTEM_ROUTES,
    );
    expect(locs(xml)).toEqual(['https://dehub.io/nodate', 'https://dehub.io/nulldate']);
    expect(xml).not.toContain('<lastmod>');
  });

  it('stays valid XML when the API returns nothing usable', () => {
    for (const input of [[], null, undefined, [{}, { username: '   ' }]]) {
      const xml = profileSitemapXml(input, SYSTEM_ROUTES);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
      expect(locs(xml)).toEqual([]);
    }
  });
});

const INDEX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <sitemap><loc>https://dehub.io/sitemap-static.xml</loc><lastmod>2026-09-01</lastmod></sitemap>',
  '  <sitemap><loc>https://dehub.io/sitemap-posts-1.xml</loc><lastmod>2026-09-01</lastmod></sitemap>',
  '  <sitemap><loc>https://dehub.io/sitemap-profiles-1.xml</loc><lastmod>2024-11-02</lastmod></sitemap>',
  '</sitemapindex>',
].join('\n');

describe('patchProfileChunks', () => {
  it('replaces the suggestion cache date with the real newest-profile date', () => {
    const out = patchProfileChunks(INDEX, { total: 3500, lastmod: '2026-08-31' });
    expect(out).toContain(
      '<loc>https://dehub.io/sitemap-profiles-1.xml</loc><lastmod>2026-08-31</lastmod>',
    );
    expect(out).not.toContain('2024-11-02');
  });

  it('leaves the single chunk alone until the list outgrows one file', () => {
    const out = patchProfileChunks(INDEX, { total: 50000, lastmod: '2026-08-31' });
    expect(out).not.toContain('sitemap-profiles-2.xml');
  });

  it('adds the chunks the upstream function does not know exist', () => {
    const out = patchProfileChunks(INDEX, { total: 120000, lastmod: '2026-08-31' });
    expect(out).toContain('<loc>https://dehub.io/sitemap-profiles-2.xml</loc>');
    expect(out).toContain('<loc>https://dehub.io/sitemap-profiles-3.xml</loc>');
    expect(out.trimEnd().endsWith('</sitemapindex>')).toBe(true);
  });

  /**
   * The whole point of the guards: a bad index takes out every sitemap on the
   * site, so anything unexpected has to leave it untouched rather than
   * half-rewritten.
   */
  it('returns the index unchanged when the API answer is missing or unusable', () => {
    expect(patchProfileChunks(INDEX, null)).toBe(INDEX);
    expect(patchProfileChunks(INDEX, {})).toBe(INDEX);
    expect(patchProfileChunks(INDEX, { total: 'lots', lastmod: 'soon' })).toBe(INDEX);
    expect(patchProfileChunks('<html>not a sitemap</html>', { total: 9, lastmod: '2026-08-31' }))
      .toBe('<html>not a sitemap</html>');
  });
});

describe('the edge route', () => {
  it('answers /sitemap-profiles-<n>.xml before the Supabase proxy sees it', () => {
    const own = WORKER.indexOf("pathname.match(/^\\/sitemap-profiles-(\\d+)\\.xml$/)");
    const proxy = WORKER.indexOf('const sitemapMatch =');
    expect(own).toBeGreaterThan(-1);
    expect(own).toBeLessThan(proxy);
  });

  /**
   * Deliberately a fall-through, not a 503: the proxy below still works, so a
   * broken API costs us the widened list for an hour instead of costing us the
   * profile sitemap entirely.
   */
  it('falls back to the proxy instead of returning an error', () => {
    const branch = WORKER.slice(
      WORKER.indexOf('const profileSitemapMatch'),
      WORKER.indexOf('const sitemapMatch ='),
    );
    expect(branch).toContain('falling back');
    expect(branch).not.toContain('503');
  });

  it('asks for the sitemap spec page size, so chunk N holds what the index promises', () => {
    expect(WORKER).toContain('const PROFILE_SITEMAP_PAGE_SIZE = 50000;');
  });
});
