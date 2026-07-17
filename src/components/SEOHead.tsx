import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  jsonLd?: Record<string, unknown>;
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
}: SEOHeadProps) {
  const fullTitle = title || defaults.title;
  // Canonical self-references the route but always on the canonical host with
  // no query/hash: mirror hosts (lovable.app) and ?param variants must
  // consolidate to the clean dehub.io URL, never self-canonicalize.
  const currentUrl =
    typeof window !== 'undefined'
      ? `https://dehub.io${window.location.pathname.replace(/\/+$/, '') || '/'}`
      : '';
  const canonicalUrl = url || currentUrl || defaults.url;


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
