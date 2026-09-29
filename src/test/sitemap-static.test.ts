/**
 * public/sitemap-static.xml is hand-kept (plus the blog rows the manifest
 * script appends and the ?hl= alternates build-seo-i18n writes), and it had
 * fallen behind the worker: 25 indexable marketing pages and a pillar guide
 * had crawler HTML and no sitemap row, and every docs row had no lastmod.
 * These fail the moment a new indexable page ships without its row.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_PAGES, GUIDE_PAGES, MARKETING_PAGES, SECTION_PAGES } from '../../CLOUDFLARE_WORKER_SEO.js';

const ROOT = resolve(__dirname, '../..');
const XML = readFileSync(resolve(ROOT, 'public/sitemap-static.xml'), 'utf8');
const LOCS = new Set([...XML.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));

/**
 * Indexable pages deliberately left out, each with its reason. Empty today;
 * a page belongs here only when it is indexable and still should not be
 * submitted.
 */
const NOT_IN_SITEMAP: Record<string, string> = {};

type Page = { noindex?: boolean; path?: string };
const routes = [
  ...Object.entries(MARKETING_PAGES as Record<string, Page>)
    .filter(([, m]) => !m.noindex)
    .map(([key, m]) => m.path || `/${key}`),
  ...Object.keys(SECTION_PAGES).map((key) => `/${key}`),
  ...Object.keys(DOCS_PAGES).map((route) => `/docs/${route}`),
  ...Object.keys(GUIDE_PAGES).map((slug) => `/guides/${slug}`),
];

describe('sitemap-static.xml', () => {
  it('is well-formed XML', () => {
    const doc = new DOMParser().parseFromString(XML, 'application/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    expect(doc.documentElement.nodeName).toBe('urlset');
  });

  it('lists every indexable page the worker renders', () => {
    const missing = routes.filter((r) => !LOCS.has(`https://dehub.io${r}`) && !Object.prototype.hasOwnProperty.call(NOT_IN_SITEMAP, r));
    expect(missing).toEqual([]);
  });

  it('lists no page the worker marks noindex', () => {
    for (const [key, m] of Object.entries(MARKETING_PAGES as Record<string, Page>)) {
      if (m.noindex) expect(LOCS.has(`https://dehub.io${m.path || `/${key}`}`), key).toBe(false);
    }
  });

  it('keeps the exception list honest', () => {
    for (const route of Object.keys(NOT_IN_SITEMAP)) {
      expect(routes, route).toContain(route);
      expect(LOCS.has(`https://dehub.io${route}`), route).toBe(false);
    }
  });

  it('dates every row, with a real date rather than a build stamp', () => {
    const rows = XML.match(/<url>[\s\S]*?<\/url>/g)!;
    const undated = rows.filter((r) => !/<lastmod>\d{4}-\d{2}-\d{2}/.test(r)).map((r) => r.match(/<loc>([^<]+)/)![1]);
    expect(undated).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    const stampedToday = rows.filter((r) => r.includes(`<lastmod>${today}`)).length;
    expect(stampedToday).toBeLessThan(rows.length / 2);
  });

  /**
   * scripts/generate-blog-manifest.mjs rewrites every /docs/* and /guides/*
   * row at build time from its own lists, so a page missing from them is
   * dropped from the deployed sitemap however the committed file looks.
   */
  it('survives the build-time rewrite of the docs and guide rows', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/generate-blog-manifest.mjs'), 'utf8');
    const list = (name: string) => {
      const body = script.match(new RegExp(String.raw`const ${name} = (?:new Set\()?\[([\s\S]*?)\]`))![1];
      return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    const docs = list('DOCS_META_ONLY');
    for (const route of Object.keys(DOCS_PAGES)) expect(docs, route).toContain(route);
    const guides = list('STANDALONE_GUIDES');
    for (const slug of Object.keys(GUIDE_PAGES)) expect(guides, slug).toContain(slug);
  });

  it('has no duplicate rows', () => {
    const all = [...XML.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(all.length).toBe(LOCS.size);
  });
});
