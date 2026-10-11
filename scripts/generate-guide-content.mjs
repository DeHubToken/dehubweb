/**
 * generate-guide-content.mjs
 * ==========================
 * Renders the hand-built React guide pages under /guides/ to plain HTML for
 * crawlers, into public/guide-content/<slug>.json. The edge worker reads that
 * file (getGuideContent) and serves it as the page's <article>.
 *
 * Crawlers never run the SPA, so what they indexed for these guides was the
 * worker's own few-hundred-word summary of a ~1,500-word page. Rendering the
 * real component keeps one source for the copy: edit the React page, rerun
 *
 *   node scripts/generate-guide-content.mjs
 *
 * and commit the JSON. It also runs at buildStart (vite.config.ts, next to
 * the blog manifest), and src/test/guide-crawler-content.test.ts renders the
 * page the same way and fails when the committed file is behind it.
 *
 * esbuild (already a vite dependency) bundles the page for node; no vite
 * build involved. SEOHead is stubbed out: it only writes <head> tags in an
 * effect, which a static render never runs, and it drags in app context.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const APP_URL = 'https://dehub.io';

/** slug → the page component that renders /guides/<slug>. */
export const GUIDE_CONTENT_PAGES = {
  'best-decentralized-streaming-apps': 'src/pages/BestDecentralizedStreaming.tsx',
};

/** Attributes a crawler reads. Everything else on these pages is styling. */
const KEPT_ATTRIBUTES = new Set(['href', 'src', 'alt', 'width', 'height']);

/**
 * The page's <article> as clean semantic HTML: no classes, no layout divs, no
 * breadcrumb (the worker renders its own), and absolute URLs, since the JSON
 * is served from a different page than the one that links from it.
 */
export function guideFragment(markup) {
  const article = String(markup).match(/<article[^>]*>([\s\S]*)<\/article>/);
  if (!article) throw new Error('[guide-content] page rendered no <article>');
  const html = article[1]
    .replace(/<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/, '')
    .replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*?)?)\s*\/?>/g, (tag, name, attrs) => {
      const kept = [];
      for (const [, key, value] of attrs.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
        if (!KEPT_ATTRIBUTES.has(key.toLowerCase())) continue;
        const absolute = (key === 'href' || key === 'src') && value.startsWith('/') ? `${APP_URL}${value}` : value;
        kept.push(` ${key}="${absolute}"`);
      }
      return `<${name}${kept.join('')}>`;
    })
    .replace(/<\/?div>/g, '')
    .replace(/<\/(h[1-6]|p|li|ul|ol|dl|dt|dd|section|header)>/g, '</$1>\n')
    .replace(/<(img[^>]*)>/g, '<$1>\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return html;
}

export function wordCount(html) {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

async function renderPage(root, source) {
  const { build } = await import('esbuild');
  const outfile = path.join(root, 'node_modules', '.cache', `guide-${path.basename(source, '.tsx')}.mjs`);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await build({
    stdin: {
      contents: [
        `import { createElement } from 'react';`,
        `import { renderToStaticMarkup } from 'react-dom/server';`,
        `import { MemoryRouter } from 'react-router-dom';`,
        `import Page from ${JSON.stringify(path.join(root, source))};`,
        `export const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Page)));`,
      ].join('\n'),
      resolveDir: root,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    outfile,
    logLevel: 'error',
    plugins: [{
      name: 'guide-content-stubs',
      setup(b) {
        b.onResolve({ filter: /^@\/components\/SEOHead$/ }, () => ({ path: 'seo-head', namespace: 'stub' }));
        b.onResolve({ filter: /^@\/hooks\/usePublicPageLocale$/ }, () => ({ path: 'public-locale', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'public-locale' ? 'export function usePublicPageLocale() { return { localized: false }; }' : 'export function SEOHead() { return null; }', loader: 'js' }));
        b.onResolve({ filter: /^@\// }, (args) =>
          b.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
      },
    }],
  });
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  return mod.markup;
}

async function main() {
  // Production React: the same markup, without dev-only SSR warnings.
  process.env.NODE_ENV ||= 'production';
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = path.join(root, 'public', 'guide-content');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [slug, source] of Object.entries(GUIDE_CONTENT_PAGES)) {
    const html = guideFragment(await renderPage(root, source));
    fs.writeFileSync(path.join(outDir, `${slug}.json`), `${JSON.stringify({ slug, html, wordCount: wordCount(html) })}\n`);
    console.log(`[guide-content] ${slug}: ${wordCount(html)} words`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
