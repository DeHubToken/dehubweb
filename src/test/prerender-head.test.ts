/**
 * Every crawler page — proxied or built at the edge — leaves the worker through
 * stylePrerendered(). It is therefore the one place a head rule can be applied
 * to all of them, and the 2026-09-13 Googlebot crawl found two that had only
 * ever reached the proxied half: 177 of 178 static pages carried no viewport
 * meta, and 65 edge-built titles ran 71–110 characters past the clamp that
 * normalizeProxiedMeta applies to posts and profiles. These pin that the
 * boilerplate is added where missing and left alone where present.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

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

const { stylePrerendered, VIEWPORT_META, TITLE_MAX } = new Function(`
  ${constant('TITLE_MAX')}
  ${constant('VIEWPORT_META')}
  ${constant('HTML_ENTITIES')}
  const PRERENDER_STYLE = '<style>/* style */</style>';
  const PRERENDER_HEADER = '<header class="dh-head"></header><main class="dh-main">';
  const PRERENDER_FOOTER = '</main>';
  function stripInlineStyles(h) { return h; }
  ${decl('function escHtml(s = \'\') {')}
  ${decl('function truncate(text, max) {')}
  ${decl('function clampEscapedTitle(escaped, max) {')}
  ${decl('function normalizePrerenderedHead(html) {')}
  ${decl('export function stylePrerendered(html) {').replace(/^export /, '')}
  return { stylePrerendered, VIEWPORT_META, TITLE_MAX };
`)() as { stylePrerendered: (html: string) => string; VIEWPORT_META: string; TITLE_MAX: number };

const LONG = "DeHub's Special Week: BNB Chain Recognition, First Class Partnership &amp; App Store Launch | DeHub Blog";
const SHORT = 'Pricing — DeHub Creator Studio';

const page = (title: string, extraHead = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta name="twitter:title" content="${title}">
${extraHead}</head>
<body>
<h1>Heading</h1>
</body>
</html>`;

const titleOf = (html: string) => html.match(/<title>([^<]*)<\/title>/)![1];
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('viewport', () => {
  it('adds one to an edge-built page that has none, right after the charset', () => {
    const out = stylePrerendered(page(SHORT));
    expect(count(out, 'name="viewport"')).toBe(1);
    expect(out.indexOf(VIEWPORT_META)).toBeGreaterThan(out.indexOf('<meta charset'));
    expect(out.indexOf(VIEWPORT_META)).toBeLessThan(out.indexOf('<title>'));
  });

  it('leaves a proxied page that already has one with exactly one', () => {
    const out = stylePrerendered(page(SHORT, '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'));
    expect(count(out, 'name="viewport"')).toBe(1);
    expect(out).toContain('initial-scale=1.0');
  });

  it('still adds one when the page declares no charset', () => {
    const out = stylePrerendered(page(SHORT).replace('<meta charset="UTF-8">\n', ''));
    expect(count(out, 'name="viewport"')).toBe(1);
  });
});

describe('title clamp', () => {
  it('cuts a 108-character blog title to the limit, in every tag that carries it', () => {
    const out = stylePrerendered(page(LONG));
    const t = titleOf(out);
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith('…')).toBe(true);
    expect(out.match(/property="og:title" content="([^"]*)"/)![1]).toBe(t);
    expect(out.match(/name="twitter:title" content="([^"]*)"/)![1]).toBe(t);
  });

  it('measures the decoded title, so an entity does not count as five characters', () => {
    // 60 characters decoded, 84 as escaped — inside the limit, must not be cut.
    const plain = 'A &amp; B '.repeat(6).trim() + ' — twenty more chars here'; // 60 decoded, 84 escaped
    const out = stylePrerendered(page(plain));
    expect(titleOf(out)).toBe(plain);
  });

  it('leaves a title inside the limit byte-identical', () => {
    const out = stylePrerendered(page(SHORT));
    expect(titleOf(out)).toBe(SHORT);
    expect(count(out, SHORT)).toBe(3);
  });

  it('does not touch a page that was already styled', () => {
    const html = page(LONG).replace('<body>', '<body><main class="dh-main">');
    expect(stylePrerendered(html)).toBe(html);
  });
});

describe('wiring', () => {
  it('runs inside stylePrerendered, which guard() applies to every HTML response', () => {
    expect(decl('export function stylePrerendered(html) {')).toContain('normalizePrerenderedHead(html)');
    expect(WORKER).toContain('return new Response(stylePrerendered(await resp.text()), {');
  });
});
