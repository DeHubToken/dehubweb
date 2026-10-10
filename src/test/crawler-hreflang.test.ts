import { localizePublicChrome, localizeStructuredData } from '../../server/public-page-locales.js';
/**
 * dehub.io had 110 UI locales and one indexable language: every page said
 * lang="en", nothing carried hreflang, and there was no localised URL. The
 * worker then served ?hl=<code> in 44–83 languages per route with only the
 * head translated — about 1,100 English-bodied duplicates. These pin the
 * shape that replaced it: a language is served only where the page is
 * translated through and through, every variant self-canonical and naming
 * all the others plus x-default, every other ?hl= 301s to the bare page, a
 * noindex page carries no cluster, and each page declares its language in
 * <html lang>, dir and og:locale.
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

type Row = { title: string; description: string; h1?: string; body?: string; lede?: string; asset?: string };
type Table = Record<string, Record<string, Row>>;
const api = new Function('localizePublicChrome', 'localizeStructuredData', `
  ${constant('APP_URL')}
  ${constant('OG_LOCALE')}
  ${constant('OG_LOCALES')}
  ${constant('RTL_LOCALES')}
  ${constant('NOINDEX_META')}
  ${decl('function escHtml(s = \'\') {')}
  ${decl('function requestedLocale(url) {')}
  ${decl('function localizedUrl(route, lang) {')}
  ${decl('function servedLocales(route, table) {')}
  ${decl('function hreflangLinks(route, table) {')}
  ${decl('function unservedLocaleRedirect(url, route, table, noindex) {')}
  ${decl('function ogLocale(lang) {')}
  ${decl('function ogLocaleTag(locale = OG_LOCALE) {')}
  ${decl('function withOgLocale(html, lang, langs) {')}
  ${decl('function jsonLdText(s) {')}
  ${decl('function localizePage(html, route, hl, table) {')}
  return { requestedLocale, localizedUrl, servedLocales, hreflangLinks, unservedLocaleRedirect, localizePage };
`)(localizePublicChrome, localizeStructuredData) as {
  requestedLocale: (url: URL) => string;
  localizedUrl: (route: string, lang: string) => string;
  servedLocales: (route: string, table: Table) => string[];
  hreflangLinks: (route: string, table: Table) => string;
  unservedLocaleRedirect: (url: URL, route: string, table: Table, noindex: boolean) => string | null;
  localizePage: (html: string, route: string, hl: string, table: Table) => string;
};

const EN_TITLE = 'Live TV — Free Channels From Around the World';
const TABLE: Table = {
  '/tv': {
    en: { title: EN_TITLE, description: 'Watch free live TV channels on DeHub.' },
    de: {
      title: 'Live TV — Kostenlose Kanäle aus der ganzen Welt',
      description: 'Kostenlose Live-TV-Kanäle auf DeHub ansehen.',
      h1: 'DeHub TV auf Deutsch',
      body: '<p>Deutscher Text über DeHub TV.</p>',
    },
    es: {
      title: 'TV en vivo — Canales gratis de todo el mundo',
      description: 'Mira canales de TV en vivo gratis en DeHub — "sin suscripción".',
      h1: 'DeHub TV',
      body: '<p>Texto en español.</p>',
    },
    ar: {
      title: 'بث تلفزيوني مباشر',
      description: 'قنوات مجانية على DeHub.',
      h1: 'DeHub TV',
      body: '<p>نص عربي.</p>',
    },
    // A head with no body is the English page again: not served.
    fr: { title: 'Télévision en direct', description: 'Chaînes gratuites.' },
    // A "translation" that is the English title: not served.
    nl: { title: EN_TITLE, description: 'Gratis kanalen.', h1: 'DeHub TV', body: '<p>Nederlandse tekst.</p>' },
  },
  '/events': {
    en: { title: 'Events on DeHub', description: 'Community events.' },
    de: { title: 'Veranstaltungen auf DeHub', description: 'Community-Events.', h1: 'Events', body: '<p>Text.</p>' },
  },
};

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${EN_TITLE}</title>
<meta name="description" content="Watch free live TV channels on DeHub.">
<link rel="canonical" href="https://dehub.io/tv">
<meta property="og:url" content="https://dehub.io/tv">
<meta property="og:title" content="${EN_TITLE}">
<meta property="og:description" content="Watch free live TV channels on DeHub.">
<meta name="twitter:title" content="${EN_TITLE}">
<meta name="twitter:description" content="Watch free live TV channels on DeHub.">
<script type="application/ld+json">{"@type":"WebPage","name":"${EN_TITLE}","description":"Watch free live TV channels on DeHub.","url":"https://dehub.io/tv"}</script>
</head>
<body>
<p><a href="https://dehub.io/">DeHub</a> › DeHub TV</p>
<h1>DeHub TV</h1>
<!--hl-body--><p>English body copy.</p><!--/hl-body-->
<nav><a href="https://dehub.io/explore">Explore</a></nav>
</body>
</html>`;

const noindexPage = page.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="robots" content="noindex, follow">');

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

describe('which languages a route is served in', () => {
  it('only those with a translated title AND a translated body', () => {
    expect(api.servedLocales('/tv', TABLE)).toEqual(['ar', 'de', 'es']);
  });

  it('drops a locale whose "translated" title is the English one', () => {
    expect(api.servedLocales('/tv', TABLE)).not.toContain('nl');
  });

  it('is nothing for a route the table does not have', () => {
    expect(api.servedLocales('/pricing', TABLE)).toEqual([]);
  });
});

describe('the cluster', () => {
  it('names every served language, English as the bare URL, and x-default', () => {
    const links = api.hreflangLinks('/tv', TABLE);
    expect(links).toContain('<link rel="alternate" hreflang="en" href="https://dehub.io/tv">');
    expect(links).toContain('<link rel="alternate" hreflang="de" href="https://dehub.io/tv?hl=de">');
    expect(links).toContain('<link rel="alternate" hreflang="es" href="https://dehub.io/tv?hl=es">');
    expect(links).toContain('<link rel="alternate" hreflang="ar" href="https://dehub.io/tv?hl=ar">');
    expect(links).toContain('<link rel="alternate" hreflang="x-default" href="https://dehub.io/tv">');
    expect(links).not.toContain('hreflang="fr"');
    expect(links).not.toContain('hreflang="nl"');
    expect(links.match(/rel="alternate"/g)!.length).toBe(5);
  });

  it('is empty for a route with no translations', () => {
    expect(api.hreflangLinks('/pricing', TABLE)).toBe('');
  });
});

describe('?hl= that is not a served page', () => {
  const redirect = (u: string, noindex = false) => api.unservedLocaleRedirect(new URL(u), '/tv', TABLE, noindex);

  it('lets a served language through', () => {
    expect(redirect('https://dehub.io/tv?hl=de')).toBeNull();
    expect(redirect('https://dehub.io/tv?hl=AR')).toBeNull();
    expect(redirect('https://dehub.io/tv')).toBeNull();
  });

  it('301s every other language, hl=en and junk to the bare URL', () => {
    for (const hl of ['en', 'fr', 'nl', 'ja', 'acm', '']) {
      expect(redirect(`https://dehub.io/tv?hl=${hl}`), hl).toBe('https://dehub.io/tv');
    }
    expect(api.unservedLocaleRedirect(new URL('https://dehub.io/?hl=zz'), '/', TABLE, false)).toBe('https://dehub.io/');
  });

  it('301s even a translated language on a noindex page', () => {
    expect(redirect('https://dehub.io/tv?hl=de', true)).toBe('https://dehub.io/tv');
  });
});

describe('the bare page', () => {
  const out = api.localizePage(page, '/tv', '', TABLE);

  it('gains the cluster and keeps everything else, including its canonical', () => {
    expect(out).toContain('hreflang="x-default"');
    expect(out).toContain('hreflang="de"');
    expect(value(out, /<link rel="canonical" href="([^"]*)">/)).toBe('https://dehub.io/tv');
    expect(value(out, /<title>([^<]*)<\/title>/)).toBe(EN_TITLE);
    expect(out).toContain('<html lang="en"');
    expect(out).toContain('<p>English body copy.</p>');
  });

  it('says en_US in og:locale and lists the served languages as alternates', () => {
    expect(value(out, /property="og:locale" content="([^"]*)"/)).toBe('en_US');
    const alternates = [...out.matchAll(/property="og:locale:alternate" content="([^"]*)"/g)].map((m) => m[1]);
    expect(alternates.sort()).toEqual(['ar_AR', 'de_DE', 'es_ES']);
  });

  it('is untouched when the route has no translations', () => {
    expect(api.localizePage(page, '/pricing', 'de', TABLE)).toBe(page);
  });

  it('treats hl=en and an unserved hl as the bare page', () => {
    expect(api.localizePage(page, '/tv', 'en', TABLE)).toBe(out);
    expect(api.localizePage(page, '/tv', 'fr', TABLE)).toBe(out);
    expect(api.localizePage(page, '/tv', 'nl', TABLE)).toBe(out);
  });

  it('rewrites an og:locale the page already has instead of adding a second', () => {
    const withLocale = page.replace('</head>', '<meta property="og:locale" content="en_US">\n</head>');
    const twice = api.localizePage(withLocale, '/tv', 'de', TABLE);
    expect(twice.match(/property="og:locale"/g)!.length).toBe(1);
    expect(value(twice, /property="og:locale" content="([^"]*)"/)).toBe('de_DE');
  });
});

describe('a noindex page', () => {
  it('carries no cluster and no locale rewrite, whatever hl asks for', () => {
    expect(api.localizePage(noindexPage, '/tv', '', TABLE)).toBe(noindexPage);
    expect(api.localizePage(noindexPage, '/tv', 'de', TABLE)).toBe(noindexPage);
  });
});

describe('a translated page', () => {
  const out = api.localizePage(page, '/tv', 'de', TABLE);

  it('swaps the title and description in every tag that carries them', () => {
    expect(value(out, /<title>([^<]*)<\/title>/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /property="og:title" content="([^"]*)"/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /name="twitter:title" content="([^"]*)"/)).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(value(out, /name="description" content="([^"]*)"/)).toBe('Kostenlose Live-TV-Kanäle auf DeHub ansehen.');
    expect(value(out, /property="og:description" content="([^"]*)"/)).toBe('Kostenlose Live-TV-Kanäle auf DeHub ansehen.');
  });

  it('translates the heading, the breadcrumb and the body, not just the head', () => {
    expect(out).toContain('<h1>DeHub TV auf Deutsch</h1>');
    expect(out).toContain('› DeHub TV auf Deutsch</p>');
    expect(out).toContain('<!--hl-body--><p>Deutscher Text über DeHub TV.</p><!--/hl-body-->');
    expect(out).not.toContain('English body copy');
  });

  it('names the page in its own language in JSON-LD', () => {
    const ld = JSON.parse(value(out, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
    expect(ld.name).toBe('Live TV — Kostenlose Kanäle aus der ganzen Welt');
    expect(ld.description).toBe('Kostenlose Live-TV-Kanäle auf DeHub ansehen.');
  });

  it('declares its language, og:locale and is canonical to its own URL', () => {
    expect(out).toContain('<html lang="de">');
    expect(value(out, /property="og:locale" content="([^"]*)"/)).toBe('de_DE');
    expect(out).toContain('<meta property="og:locale:alternate" content="en_US">');
    expect(value(out, /<link rel="canonical" href="([^"]*)">/)).toBe('https://dehub.io/tv?hl=de');
    expect(value(out, /property="og:url" content="([^"]*)"/)).toBe('https://dehub.io/tv?hl=de');
  });

  it('writes the direction too for a right-to-left language', () => {
    expect(api.localizePage(page, '/tv', 'ar', TABLE)).toContain('<html lang="ar" dir="rtl">');
  });

  it('still names every sibling, so the cluster is reciprocal', () => {
    expect(out).toContain('hreflang="es" href="https://dehub.io/tv?hl=es"');
    expect(out).toContain('hreflang="en" href="https://dehub.io/tv"');
    expect(out).toContain('hreflang="x-default" href="https://dehub.io/tv"');
  });

  it('escapes what it writes into attributes', () => {
    const es = api.localizePage(page, '/tv', 'es', TABLE);
    expect(value(es, /name="description" content="([^"]*)"/)).toContain('&quot;sin suscripción&quot;');
  });

  it('swaps the opening paragraph when the page names a lede', () => {
    const table: Table = { '/': { en: { title: 'Home', description: 'd' }, de: { title: 'Startseite', description: 'd', h1: 'Startseite', body: '<p>b</p>', lede: 'Einleitung.' } } };
    const home = '<html lang="en"><head><title>Home</title></head><body><h1>Home</h1>\n  <p>English lede.</p><!--hl-body--><p>x</p><!--/hl-body--></body></html>';
    const de = api.localizePage(home, '/', 'de', table);
    expect(de).toContain('<h1>Startseite</h1>\n  <p>Einleitung.</p>');
    expect(de).not.toContain('English lede');
  });
});

describe('wiring', () => {
  it('runs on the marketing pages, reads the table through ASSETS, and 301s unserved hl', () => {
    expect(WORKER).toContain('const localeRedirect = unservedLocaleRedirect(url, `/${sectionKey}`, table, MARKETING_PAGES[sectionKey].noindex);');
    expect(WORKER).toContain('html = localizePage(html, route, lang,');
    expect(WORKER).toContain("env.ASSETS.fetch(new URL('/seo-i18n.json', requestUrl)");
  });

  /**
   * The homepage and the docs index carry the site's hardest keywords and
   * render outside the marketing branch, so each is wired on its own.
   */
  it('runs on the homepage and the docs index too', () => {
    expect(WORKER).toContain("const localeRedirect = unservedLocaleRedirect(url, '/', table, false);");
    expect(WORKER).toContain("const route = canonicalizePath(pathname)");
    expect(WORKER).toContain("const localeRedirect = unservedLocaleRedirect(url, '/docs', table, false);");
    expect(WORKER).toContain('const page = { ...row, ...await asset.json() };');
    expect((WORKER.match(/if \(localeRedirect\) return redirect301\(localeRedirect\);/g) || []).length).toBe(3);
  });

  it('marks the translatable body in every page builder that localizePage runs on', () => {
    expect(decl('function buildMarketingHtml(key, meta) {')).toContain('<!--hl-body-->${meta.bodyHtml');
    expect(decl('function buildDocsIndexHtml() {')).toContain('<!--hl-body--><ul');
    const intro = WORKER.slice(WORKER.indexOf('const HOME_INTRO_HTML'), WORKER.indexOf('</section>`;', WORKER.indexOf('const HOME_INTRO_HTML')));
    expect(intro).toContain('<!--hl-body-->');
    expect(intro).toContain('<!--/hl-body-->');
  });

  it('has a fully translated page to serve for the homepage and the docs', () => {
    const table = JSON.parse(readFileSync(resolve(ROOT, 'public/seo-i18n.json'), 'utf8')) as Table;
    for (const route of ['/', '/docs']) {
      expect(api.servedLocales(route, table), route).toEqual(['ar', 'es', 'fr', 'nl', 'tr']);
      expect(table[route].es.title).toContain('DeHub');
      expect(JSON.parse(readFileSync(resolve(ROOT, 'public' + table[route].es.asset), 'utf8')).body).toContain('<a href="https://dehub.io/docs');
    }
    expect(JSON.parse(readFileSync(resolve(ROOT, 'public' + table['/'].es.asset), 'utf8')).lede).toBeTruthy();
  });

  it('serves no language on the noindex hubs', () => {
    const table = JSON.parse(readFileSync(resolve(ROOT, 'public/seo-i18n.json'), 'utf8')) as Table;
    expect(api.servedLocales('/events', table)).toEqual([]);
    expect(api.servedLocales('/launchpad', table)).toEqual([]);
  });

  it('the app honours ?hl= on arrival and keeps it', () => {
    expect(I18N_INDEX).toContain("get('hl')");
    expect(I18N_INDEX).toContain('localStorage.setItem(STORAGE_KEY, urlLang)');
    expect(I18N_INDEX).toMatch(/let defaultLang = savedLang \|\| browserLang;/);
  });
});
