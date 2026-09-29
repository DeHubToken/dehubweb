/**
 * The worker serves crawlers /docs/<route> from public/docs-content/<route>.json
 * and falls back to the one-line description when the file is missing. Eleven
 * of the twenty-three sitemap docs pages shipped that way — /docs/featured-in,
 * where every old dehub.net /web/news/* link lands, among them — so Google saw
 * a press page that cited nothing. These keep every indexable docs route on a
 * real body.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

function block(start: string, end: string): string {
  const from = WORKER.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  return WORKER.slice(from, WORKER.indexOf(end, from) + end.length);
}

const { DOCS_PAGES, DOCS_COMING_SOON } = new Function(`
  ${block('const DOCS_PAGES = {', '\n};')}
  ${block('const DOCS_COMING_SOON = new Set([', ']);')}
  return { DOCS_PAGES, DOCS_COMING_SOON };
`)() as { DOCS_PAGES: Record<string, { title: string }>; DOCS_COMING_SOON: Set<string> };

type DocsContent = { route: string; section: string; html: string; wordCount: number };
const contentPath = (route: string) => resolve(ROOT, 'public/docs-content', `${route.replace(/\//g, '-')}.json`);
const content = (route: string): DocsContent => JSON.parse(readFileSync(contentPath(route), 'utf8'));

const indexable = Object.keys(DOCS_PAGES).filter((r) => !DOCS_COMING_SOON.has(r));
// Rendered by DocsSurface and on its way into DOCS_PAGES; its body is ready first.
const routes = [...new Set([...indexable, 'guidelines'])];

describe('docs crawler content', () => {
  it('reads the route table', () => {
    expect(indexable.length).toBeGreaterThanOrEqual(23);
  });

  it.each(routes)('/docs/%s has a docs-content file with a real body', (route) => {
    expect(existsSync(contentPath(route)), `public/docs-content/${route.replace(/\//g, '-')}.json`).toBe(true);
    const c = content(route);
    expect(c.route).toBe(route);
    expect(c.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(15);
    // The worker supplies the page's only <h1>.
    expect(c.html).not.toMatch(/<h1[\s>]/);
  });

  it('cites every press article on /docs/featured-in with a followed outbound link', () => {
    const { html } = content('featured-in');
    for (const host of ['www.usmagazine.com', 'finance.yahoo.com', 'web.archive.org/web/20220702152228/https://www.entrepreneur.com', 'www.investing.com']) {
      const link = html.match(new RegExp(`<a href="https://${host.replace(/[.]/g, '\\.')}[^"]*"[^>]*>`));
      expect(link, host).not.toBeNull();
      expect(link![0]).not.toContain('nofollow');
    }
    // Entrepreneur pulled the original; the dead URL must not come back.
    expect(html).not.toContain('href="https://www.entrepreneur.com/article/420564"');
  });
});
