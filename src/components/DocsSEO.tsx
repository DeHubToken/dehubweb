import { useLocation } from 'react-router-dom';
import { getDocsSeoForPath } from '@/lib/docs/seo';
import { SEOHead } from '@/components/SEOHead';
import { useLanguage } from '@/contexts/LanguageContext';

/** The same locale metadata and canonical rules apply to docs and app pages. */
export function DocsSEO() {
  const { pathname } = useLocation();
  const { t, language } = useLanguage();
  const { entry, canonical, key } = getDocsSeoForPath(pathname);
  // Articles own their metadata; the persistent docs layout must not overwrite it.
  if (pathname.startsWith('/guides/') || pathname.startsWith('/docs/blog/')) return null;
  // English comes straight from lib/docs/seo; other languages from the docs
  // bundles, falling back to that English for a key a bundle does not have.
  const shown = (field: 'Title' | 'Desc', english: string) => {
    if (language === 'en' || !key) return english;
    const path = `docsSeo.${key}${field}`;
    const value = t(path);
    return value === path ? english : value;
  };
  const title = shown('Title', entry.title);
  const description = shown('Desc', entry.description);
  return <SEOHead
    title={title}
    description={description}
    url={canonical}
    type="article"
    jsonLd={{
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: title,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'DeHub Docs', url: 'https://dehub.io/docs' },
    }}
  />;
}
