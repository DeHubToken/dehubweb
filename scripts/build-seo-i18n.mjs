// Builds public/seo-i18n.json — the translated head AND body of every crawler
// page served at ?hl=<code> — and writes the matching hreflang alternates into
// public/sitemap-static.xml.
//
// The worker serves each route in each language listed here, with a
// reciprocal hreflang cluster, and 301s every other ?hl= to the bare page. It
// reads this file through the ASSETS binding at request time rather than
// bundling locale files.
//
// A language is listed for a route only when all of this holds, because a
// page that is English underneath is a duplicate to Google, not a variant:
//  - it is one of SEO_I18N_LOCALES, the languages visitors actually arrive in;
//  - the locale file carries the page's seoTitle and seoDescription, and the
//    title is not simply the English one;
//  - scripts/seo-i18n-copy/<lang>.json carries the page's heading and body.
// Titles and descriptions come from the app's locale files, so the SPA and the
// crawler page say the same thing; the body copy exists only for crawlers and
// lives in seo-i18n-copy.
//
// Run: node scripts/build-seo-i18n.mjs   (src/test/seo-i18n-sync.test.ts fails
// when either output is behind its sources.)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_URL = 'https://dehub.io';

/** en.json namespace → crawler route. Add a pair here when a page gains SEO keys. */
export const SEO_I18N_ROUTES = {
  accounts: '/accounts',
  // The two pages the rest of the site is judged on. Their namespaces exist
  // only to carry these keys: both pages are rendered by the worker rather
  // than by a React page with its own SEOHead, so nothing else reads them.
  home: '/',
  docs: '/docs',
  apk: '/apk',
  arcade: '/arcade',
  converter: '/converter',
  depin: '/depin',
  dex: '/dex',
  events: '/events',
  fractions: '/fractions',
  jobs: '/jobs',
  launchpad: '/launchpad',
  // The namespace is `migrate`; the page has always lived at /migrate-youtube.
  migrate: '/migrate-youtube',
  premium: '/premium',
  prompt: '/prompt',
  stages: '/stages',
  tv: '/tv',
  usernames: '/usernames',
};

/**
 * The languages crawler pages are served in besides English: the five biggest
 * non-English audiences in the Cloudflare country breakdown behind /api/stats
 * (30 days to 2026-09-29, countries mapped to their main language): Turkish
 * 9.5% of requests, Spanish 9.4%, French 3.2%, Arabic 2.6%, Dutch 1.9%. Add a
 * language here only together with its seo-i18n-copy file.
 */
export const SEO_I18N_LOCALES = ['ar', 'es', 'fr', 'nl', 'tr'];

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function buildSeoI18n(localesDir, copyDir = join(HERE, 'seo-i18n-copy')) {
  const out = {};
  const en = readJson(join(localesDir, 'en.json'));
  for (const [ns, route] of Object.entries(SEO_I18N_ROUTES)) {
    const title = clean(en?.[ns]?.seoTitle);
    const description = clean(en?.[ns]?.seoDescription);
    if (title && description) out[route] = { en: { title, description } };
  }
  for (const lang of SEO_I18N_LOCALES) {
    const json = readJson(join(localesDir, `${lang}.json`));
    const copy = readJson(join(copyDir, `${lang}.json`));
    for (const [ns, route] of Object.entries(SEO_I18N_ROUTES)) {
      if (!out[route]) continue;
      const title = clean(json?.[ns]?.seoTitle);
      const description = clean(json?.[ns]?.seoDescription);
      const page = copy[route] || {};
      const h1 = clean(page.h1);
      const body = typeof page.body === 'string' ? page.body.trim() : '';
      if (!title || !description || !h1 || !body) continue;
      if (title === out[route].en.title) continue;
      out[route][lang] = { title, description, h1, body, ...(page.lede ? { lede: clean(page.lede) } : {}) };
    }
  }
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((r) => [r, Object.fromEntries(Object.keys(out[r]).sort().map((l) => [l, out[r][l]]))]),
  );
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const locUrl = (route, lang) => `${APP_URL}${route}${lang && lang !== 'en' ? `?hl=${lang}` : ''}`;

/**
 * sitemap-static.xml with the ?hl= variants of every translated route: an
 * xhtml:link alternate for each language on the English row, and a row of its
 * own for each variant carrying the same set — the form Google reads hreflang
 * from in a sitemap. Idempotent: every earlier variant row and alternate is
 * dropped first, so the file always matches the table.
 */
export function withSitemapAlternates(xml, table) {
  let out = xml
    .replace(/\s*<url>\s*<loc>[^<]*\?hl=[a-z]{2}<\/loc>[\s\S]*?<\/url>/g, '')
    .replace(/\n[ \t]*<xhtml:link [^>]*\/>/g, '');
  if (!out.includes('xmlns:xhtml=')) {
    out = out.replace(/<urlset xmlns="[^"]*"/, (m) => `${m} xmlns:xhtml="http://www.w3.org/1999/xhtml"`);
  }
  for (const [route, langs] of Object.entries(table)) {
    const served = Object.keys(langs).filter((l) => l !== 'en');
    if (!served.length) continue;
    const loc = xmlEsc(locUrl(route, 'en'));
    const block = out.match(new RegExp(`\\n([ \\t]*)<url>\\s*<loc>${loc.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&')}</loc>[\\s\\S]*?</url>`));
    if (!block) continue;
    const indent = block[1];
    const links = [...served, 'en']
      .sort()
      .map((l) => `${indent}  <xhtml:link rel="alternate" hreflang="${l}" href="${xmlEsc(locUrl(route, l))}"/>`)
      .concat(`${indent}  <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`)
      .join('\n');
    const english = block[0].replace(/\n[ \t]*<\/url>$/, `\n${links}\n${indent}</url>`);
    const variants = served.map((l) =>
      english.replace(`<loc>${loc}</loc>`, `<loc>${xmlEsc(locUrl(route, l))}</loc>`),
    );
    out = out.replace(block[0], () => [english, ...variants].join(''));
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(HERE, '..');
  const table = buildSeoI18n(join(root, 'src/i18n/locales'));
  writeFileSync(join(root, 'public/seo-i18n.json'), `${JSON.stringify(table, null, 2)}\n`);
  const sitemapPath = join(root, 'public/sitemap-static.xml');
  writeFileSync(sitemapPath, withSitemapAlternates(readFileSync(sitemapPath, 'utf8'), table));
  const pages = Object.values(table).reduce((n, langs) => n + Object.keys(langs).length - 1, 0);
  console.log(`seo-i18n.json: ${Object.keys(table).length} routes, ${pages} localised pages`);
}
