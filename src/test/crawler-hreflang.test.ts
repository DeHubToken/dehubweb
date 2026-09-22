/**
 * dehub.io had 110 UI locales and one indexable language: every page said
 * lang="en", nothing carried hreflang, and there was no localised URL. The
 * worker now serves ?hl=<code> for the routes whose SEO strings are
 * translated (public/seo-i18n.json) and ties the variants together. These pin
 * the shape Google honours — every variant self-canonical, every variant
 * naming all the others plus x-default — and that nothing is declared for a
 * route or a language the table does not have.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const I18N_INDEX = readFileSync(resolve(ROOT, 'src/i18n/index.ts'), 'utf8');

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

type Table = Record<string, Record<string, { title: string; description: string }>>;
const api = new Function(`
  ${constant('APP_URL')}
  ${decl('function escHtml(s = \'\') {')}
  ${decl('function requestedLocale(url) {')}
  ${decl('function localizedUrl(route, lang) {')}
  ${decl('function hreflangLinks(route, table) {')}
  ${decl('function localizePage(html, route, hl, table) {')}
  return { requestedLocale, localizedUrl, hreflangLinks, localizePage };
`)() as {
  requestedLocale: (url: URL) => string;
  localizedUrl: (route: string, lang: string) => string;
  hreflangLinks: (route: string, table: Table) => string;
  localizePage: (html: string, route: string, hl: string, table: Table) => string;
};

const TABLE: Table = {
  '/tv': {
    en: { title: 'Live TV — Free Channels From Around the World', description: 'Watch free live TV channels on DeHub.' },
    de: { title: 'Live TV — Kostenlose Kanäle aus der ganzen Welt', description: 'Kostenlose Live-TV-Kanäle auf DeHub ansehen.' },
    es: { title: 'TV en vivo — Canales gratis de todo el mundo', description: 'Mira canales de TV en vivo gratis en DeHub — "sin suscripción".' },
  },
};

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Live TV — Free Channels From Around the World</title>
<meta name="description" content="Watch free live TV channels on DeHub.">
<link rel="canonical" href="https://dehub.io/tv">
<meta property="og:url" content="https://dehub.io/tv">
<meta property="og:title" content="Live TV — Free Channels From Around the World">
<meta property="og:description" content="Watch free live TV channels on DeHub.">
<meta name="twitter:title" content="Live TV — Free Channels From Around the World">
<meta name="twitter:description" content="Watch free live TV channels on DeHub.">
</head>
<body>
<h1>DeHub TV</h1>
<p>English body copy stays.</p>
</body>
</html>`;

const value = (html: string, re: RegExp) => html.match(re)![1];

describe('the request', () => {
  it('accepts two lowercase letters and nothing else', () => {
    expect(api.requestedLocale(new URL('https://dehub.io/tv?hl=de'))).toBe('de');
    expect(api.requestedLocale(new URL('https://dehub.io/tv?hl=DE'))).toBe('de');
    expect(api.requestedLocale(new URL('https://dehub.io/tv?hl=acm'))).toBe('');
    expect(api.requestedLocale(new URL('https://dehub.io/tv?hl=<script>'))).toBe('');
    expect(api.requestedLocale(new URL('https://dehub.io/tv'))).toBe('');
  });
});

describe('the cluster', () => {
  it('names every translated language, English as the bare URL, and x-default', () => {
    const links = api.hreflangLinks('/tv', TABLE);
    expect(links).toContain('<link rel="alternate" hreflang="en" href="https://dehub.io/tv">');
    expect(links).toContain('<link rel="alternate" hreflang="de" href="https://dehub.io/tv?hl=de">');
    expect(links).toContain('<link rel="alternate" hreflang="es" href="https://dehub.io/tv?hl=es">');
    expect(links).toContain('<link rel="alternate" hreflang="x-default" href="https://dehub.io/tv">');
    expect(links.match(/rel="alternate"/g)!.length).toBe(4);
  });

  it('is empty for a route with no translations', () => {
    expect(api.hreflangLinks('/pricing', TABLE)).toBe('');
  });
});

describe('the bare page', () => {
  it('gains the cluster and keeps everything else, including its canonical', () => {
    const out = api.localizePage(page, '/tv', '', TABLE);
    expect(out).toContain('hreflang="x-default"');
    expect(out).toContain('hreflang="de"');
    expect(value(out, /<link rel="canonical" href="([^"]*)">/)).toBe('https://dehub.io/tv');
    expect(value(out, /<title>([^<]*)<\/title>/)).toBe('Live TV — Free Channels From Around the World');
    expect(out).toContain('<html lang="en"');
  });

  it('is untouched when the route has no translations', () => {
    expect(api.localizePage(page, '/pricing', 'de', TABLE)).toBe(page);
  });

  it('treats hl=en and an untranslated hl as the bare page', () => {
    expect(api.localizePage(page, '/tv', 'en', TABLE)).toBe(api.localizePage(page, '/tv', '', TABLE));
    expect(api.localizePage(page, '/tv', 'fr', TABLE)).toBe(api.localizePage(page, '/tv', '', TABLE));
  });
});

describe('a translated page', () => {
  const out = api.localizePage(page, '/tv', 'de', TABLE);

  it('swaps the title, description and heading, in every tag that carries them', () => {
    expect(value(out, /<title>([^<]*)<\/title>/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /property="og:title" content="([^"]*)"/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /name="twitter:title" content="([^"]*)"/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /name="description" content="([^"]*)"/)).toBe('Kostenlose Live-TV-Kanäle auf DeHub ansehen.');
    expect(value(out, /property="og:description" content="([^"]*)"/)).toBe('Kostenlose Live-TV-Kanäle auf DeHub ansehen.');
    expect(out).toContain('<h1>Live TV — Kostenlose Kanäle aus der ganzen Welt</h1>');
  });

  it('declares its language and is canonical to its own URL', () => {
    expect(out).toContain('<html lang="de"');
    expect(value(out, /<link rel="canonical" href="([^"]*)">/)).toBe('https://dehub.io/tv?hl=de');
    expect(value(out, /property="og:url" content="([^"]*)"/)).toBe('https://dehub.io/tv?hl=de');
  });

  it('still names every sibling, so the cluster is reciprocal', () => {
    expect(out).toContain('hreflang="es" href="https://dehub.io/tv?hl=es"');
    expect(out).toContain('hreflang="en" href="https://dehub.io/tv"');
    expect(out).toContain('hreflang="x-default" href="https://dehub.io/tv"');
  });

  it('leaves the body alone and escapes what it writes', () => {
    expect(out).toContain('<p>English body copy stays.</p>');
    const es = api.localizePage(page, '/tv', 'es', TABLE);
    expect(value(es, /name="description" content="([^"]*)"/)).toContain('&quot;sin suscripción&quot;');
  });
});

describe('wiring', () => {
  it('runs on the marketing pages, reads the table through ASSETS, and redirects hl=en', () => {
    expect(WORKER).toContain("if (requestedLocale(url) === 'en') return redirect301(`${APP_URL}/${sectionKey}`);");
    expect(WORKER).toContain('html = localizePage(html, `/${sectionKey}`, requestedLocale(url), await seoI18nTable(env, request.url));');
    expect(WORKER).toContain("env.ASSETS.fetch(new URL('/seo-i18n.json', requestUrl)");
  });

  /**
   * The homepage and the docs index carry the site's hardest keywords and were
   * the two pages with no cluster at all — every one of the 110 UI locales was
   * a duplicate of the English page rather than a variant of it. They render
   * outside the marketing branch, so each needed wiring of its own.
   */
  it('runs on the homepage and the docs index too', () => {
    expect(WORKER).toContain("if (requestedLocale(url) === 'en') return redirect301(`${APP_URL}/`);");
    expect(WORKER).toContain("html = localizePage(html, '/', requestedLocale(url), await seoI18nTable(env, request.url));");
    expect(WORKER).toContain("if (requestedLocale(url) === 'en') return redirect301(`${APP_URL}/docs`);");
    expect(WORKER).toMatch(/localizePage\(\s*buildDocsIndexHtml\(\),\s*'\/docs',/);
  });

  it('has a translated head to serve for both', () => {
    const table = JSON.parse(readFileSync(resolve(ROOT, 'public/seo-i18n.json'), 'utf8')) as Table;
    for (const route of ['/', '/docs']) {
      expect(Object.keys(table[route] ?? {}).length, route).toBeGreaterThan(50);
      expect(table[route].es.title).toContain('DeHub');
    }
  });

  it('the app honours ?hl= on arrival and keeps it', () => {
    expect(I18N_INDEX).toContain("get('hl')");
    expect(I18N_INDEX).toContain('localStorage.setItem(STORAGE_KEY, urlLang)');
    expect(I18N_INDEX).toMatch(/let defaultLang = savedLang \|\| browserLang;/);
  });
});
