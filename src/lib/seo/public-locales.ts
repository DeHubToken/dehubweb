import manifest from '@/i18n/public-locales.json';
import { canonicalPath, SITE_URL } from './route-meta';

export interface PublicPageLocale {
  title: string;
  description: string;
  h1: string;
  body: string;
  md?: string;
  lede?: string;
}

export const publicLocaleVersion = manifest.version;
export function publicPagePath(pathname: string): string {
  return canonicalPath(pathname).replace(/^\/docs\/blog\//, '/guides/');
}
export function publicPageLanguages(pathname: string): string[] {
  return (manifest.routes as Record<string, string[]>)[publicPagePath(pathname)] || [];
}
export function localizedPageUrl(pathname: string, lang: string): string {
  const route = publicPagePath(pathname);
  return `${SITE_URL}${route}${lang !== 'en' && publicPageLanguages(route).includes(lang) ? `?hl=${lang}` : ''}`;
}
export function publicPageAsset(pathname: string, lang: string): string | null {
  const route = publicPagePath(pathname);
  if (!publicPageLanguages(route).includes(lang)) return null;
  return `/locale-pages/${manifest.version}/${lang}/${route === '/' ? 'index' : route.slice(1)}.json`;
}
export function writeLanguageAlternates(pathname: string, lang: string, indexable: boolean): void {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach(node => node.remove());
  document.head.querySelectorAll('meta[property="og:locale:alternate"]').forEach(node => node.remove());
  const languages = indexable ? publicPageLanguages(pathname) : [];
  const territory: Record<string, string> = { en: 'en_US', ar: 'ar_AR', es: 'es_ES', fr: 'fr_FR', nl: 'nl_NL', tr: 'tr_TR' };
  let locale = document.head.querySelector<HTMLMetaElement>('meta[property="og:locale"]');
  if (!locale) { locale = document.createElement('meta'); locale.setAttribute('property', 'og:locale'); document.head.appendChild(locale); }
  locale.content = territory[lang] || lang;
  if (!languages.length) return;
  for (const code of ['en', ...languages, 'x-default']) {
    const link = document.createElement('link');
    link.rel = 'alternate'; link.hreflang = code;
    link.href = localizedPageUrl(pathname, code === 'x-default' ? 'en' : code);
    document.head.appendChild(link);
    if (code !== lang && code !== 'x-default') {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:locale:alternate');
      meta.content = territory[code] || code;
      document.head.appendChild(meta);
    }
  }
}
