import { useLocation } from 'react-router-dom';
import { getDocsSeoForPath } from '@/lib/docs/seo';
import { SEOHead } from '@/components/SEOHead';

/** The same locale metadata and canonical rules apply to docs and app pages. */
export function DocsSEO() {
  const { pathname } = useLocation();
  const { entry, canonical } = getDocsSeoForPath(pathname);
  // Articles own their metadata; the persistent docs layout must not overwrite it.
  if (pathname.startsWith('/guides/') || pathname.startsWith('/docs/blog/')) return null;
  return <SEOHead
    title={entry.title}
    description={entry.description}
    url={canonical}
    type="article"
    jsonLd={{
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: entry.title,
      description: entry.description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'DeHub Docs', url: 'https://dehub.io/docs' },
    }}
  />;
}
