// Fail a deployment if Vite copied a sitemap that lost translated URLs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sitemap = readFileSync(resolve(root, 'dist/sitemap-static.xml'), 'utf8');
const pages = JSON.parse(readFileSync(resolve(root, 'dist/seo-i18n.json'), 'utf8'));
const blocks = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)];
const byUrl = new Map(blocks.map(([, url, content]) => [url.replaceAll('&amp;', '&'), content]));
const excluded = new Set(['/events', '/launchpad']);
let variants = 0;

for (const [route, languages] of Object.entries(pages)) {
  if (excluded.has(route)) continue;
  const served = Object.keys(languages).filter((language) => language !== 'en');
  if (!served.length) continue;
  const urls = [...served, 'en'].map((language) =>
    `https://dehub.io${route}${language === 'en' ? '' : `?hl=${language}`}`,
  );
  for (const url of urls) {
    const content = byUrl.get(url);
    if (!content) throw new Error(`Missing translated sitemap URL: ${url}`);
    for (const [index, language] of [...served, 'en'].entries()) {
      const alternate = `<xhtml:link rel="alternate" hreflang="${language}" href="${urls[index].replaceAll('&', '&amp;')}"/>`;
      if (!content.includes(alternate)) throw new Error(`Missing ${language} alternate on ${url}`);
    }
    if (!content.includes(`<xhtml:link rel="alternate" hreflang="x-default" href="https://dehub.io${route}"/>`)) {
      throw new Error(`Missing x-default alternate on ${url}`);
    }
    variants += 1;
  }
}

for (const route of excluded) {
  if (byUrl.has(`https://dehub.io${route}`) || [...byUrl.keys()].some((url) => url.startsWith(`https://dehub.io${route}?hl=`))) {
    throw new Error(`Noindex route appears in sitemap: ${route}`);
  }
}

console.log(`SEO build contains ${variants} reciprocal URLs across ${Object.keys(pages).length - excluded.size} indexable routes`);
