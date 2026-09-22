// Builds public/seo-i18n.json: the translated <title> and description for
// every crawler page that has them, per locale, keyed by route.
//
// The worker serves each of these routes at ?hl=<code> for a crawler, with the
// translated head and a reciprocal hreflang cluster, so a search in Spanish can
// land on the Spanish result. It reads this file through the ASSETS binding at
// request time rather than bundling 83 locale files.
//
// Only locales with an ISO 639-1 code are included: hreflang accepts nothing
// else, and a page Google cannot annotate is a duplicate rather than a variant.
// Only routes whose page namespace carries both `seoTitle` and
// `seoDescription` in a locale are included for that locale, so nothing is
// declared translated that is not.
//
// Run: node scripts/build-seo-i18n.mjs   (src/test/seo-i18n-sync.test.ts fails
// when the committed file is behind the locales.)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** en.json namespace → crawler route. Add a pair here when a page gains SEO keys. */
export const SEO_I18N_ROUTES = {
  accounts: '/accounts',
  // The two pages the rest of the site is judged on. Their namespaces exist
  // only to carry these keys: both pages are rendered by the worker rather
  // than by a React page with its own SEOHead, so nothing else reads them.
  home: '/',
  docs: '/docs',
  arcade: '/arcade',
  converter: '/converter',
  depin: '/depin',
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

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

export function buildSeoI18n(localesDir) {
  const out = {};
  const files = readdirSync(localesDir)
    .filter((f) => /^[a-z]{2}\.json$/.test(f))
    .sort();
  for (const file of files) {
    const lang = file.slice(0, 2);
    const json = JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
    for (const [ns, route] of Object.entries(SEO_I18N_ROUTES)) {
      const title = clean(json?.[ns]?.seoTitle);
      const description = clean(json?.[ns]?.seoDescription);
      if (!title || !description) continue;
      (out[route] ||= {})[lang] = { title, description };
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((r) => [r, out[r]]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const table = buildSeoI18n(join(root, 'src/i18n/locales'));
  writeFileSync(join(root, 'public/seo-i18n.json'), `${JSON.stringify(table, null, 2)}\n`);
  const pages = Object.values(table).reduce((n, langs) => n + Object.keys(langs).length, 0);
  console.log(`seo-i18n.json: ${Object.keys(table).length} routes, ${pages} localised pages`);
}
