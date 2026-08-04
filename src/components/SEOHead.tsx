import { useContext, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { upsertCanonical, upsertMeta, upsertSocialMeta, setRobots, setJsonLd } from '@/lib/head-meta';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  jsonLd?: Record<string, unknown>;
  /** Mark the page noindex. Written imperatively (the Helmet copy is inert),
   *  and restored to the host-appropriate default when absent so a cached
   *  noindexed page can't leak its robots tag onto the next route. */
  noindex?: boolean;
}

const defaults = {
  title: 'DeHub — Open Source, User Owned Social Media',
  description: 'DeHub is open source, user owned and censorship resistant media.',
  image: 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg',
  url: 'https://dehub.io',
};

export function SEOHead({
  title,
  description = defaults.description,
  image = defaults.image,
  url,
  type = 'website',
  jsonLd,
  noindex = false,
}: SEOHeadProps) {
  // Hidden cached pages stay mounted; if they kept rendering Helmet, whichever
  // page happened to render last would own the tab title for every route.
  const isActivePage = useContext(CachedPageActiveContext);
  const fullTitle = title || defaults.title;
  // Canonical self-references the route but always on the canonical host with
  // no query/hash: mirror hosts (lovable.app) and ?param variants must
  // consolidate to the clean dehub.io URL, never self-canonicalize.
  const currentUrl =
    typeof window !== 'undefined'
      ? `https://dehub.io${window.location.pathname.replace(/\/+$/, '') || '/'}`
      : '';
  const canonicalUrl = url || currentUrl || defaults.url;

  // react-helmet-async (v3) renders nothing in this app: every route was left
  // on the static index.html title, so tabs and bookmarks were all identical.
  // Write the document-level bits ourselves so the head is never at the mercy
  // of the library — that includes og:/twitter:, robots and JSON-LD, which were
  // previously Helmet-only and therefore never reached the DOM at all. Only the
  // active page may write — with ~30 pages held mounted by PersistentPageCache,
  // hidden ones would otherwise stomp the real tags.
  const jsonLdString = jsonLd ? JSON.stringify(jsonLd) : null;
  useEffect(() => {
    if (!isActivePage) return;
    document.title = fullTitle;
    upsertCanonical(canonicalUrl);
    upsertMeta('name', 'description', description);
    upsertSocialMeta({ title: fullTitle, description, url: canonicalUrl, image, type });
    setRobots(noindex);
    setJsonLd(jsonLdString);
  }, [isActivePage, fullTitle, canonicalUrl, description, image, type, noindex, jsonLdString]);

  if (!isActivePage) return null;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={canonicalUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
