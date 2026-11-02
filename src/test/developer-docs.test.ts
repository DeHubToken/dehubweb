/**
 * The developer docs render from src/data/developer-docs.json, and crawlers
 * read the copy built from it into public/docs-content. These keep the two in
 * step, keep every page reachable, and keep internal links pointing at routes
 * that exist.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build script
import { contentFor } from '../../scripts/build-developer-docs-content.mjs';
import developerDocs from '@/data/developer-docs.json';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const pages = developerDocs.pages;
const surface = read('src/pages/DocsSurface.tsx');
const worker = read('CLOUDFLARE_WORKER_SEO.js');
const sitemap = read('public/sitemap-static.xml');

describe('developer docs', () => {
  it.each(pages.map((p) => [p.route, p]))('/docs/%s crawler copy matches the page data', (route, page) => {
    const file = JSON.parse(read(`public/docs-content/${String(route).replace(/\//g, '-')}.json`));
    expect(file).toEqual(contentFor(page));
  });

  it.each(pages.map((p) => p.route))('/docs/%s is routed and described for crawlers', (route) => {
    expect(surface).toContain(`<Route path="/docs/${route}" element={dev('${route}')} />`);
    expect(worker).toContain(`  '${route}': { title:`);
  });

  it.each(pages.map((p) => p.route))('/docs/%s is in the sitemap and survives its rewrite', (route) => {
    expect(sitemap).toContain(`<loc>https://dehub.io/docs/${route}</loc>`);
    expect(read('scripts/generate-blog-manifest.mjs')).toContain(`'${route}'`);
  });

  it('keeps titles and descriptions within search result lengths', () => {
    for (const p of pages) {
      expect(p.seoTitle.length, p.route).toBeLessThanOrEqual(60);
      expect(p.description.length, p.route).toBeLessThanOrEqual(200);
    }
  });

  it('links only to docs pages that exist', () => {
    const known = new Set(pages.map((p) => `/docs/${p.route}`));
    const text = JSON.stringify(developerDocs);
    const links = [...text.matchAll(/\]\((\/docs\/[a-z/-]+)/g), ...text.matchAll(/"to": ?"(\/docs\/[a-z/-]+)"/g)].map((m) => m[1]);
    for (const link of links) {
      expect(known.has(link) || surface.includes(`path="${link}"`), link).toBe(true);
    }
  });

  it('every section id is unique within its page', () => {
    for (const p of pages) {
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size, p.route).toBe(ids.length);
    }
  });
});
