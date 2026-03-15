import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

const defaults = {
  title: 'DeHub',
  description: 'DeHub is open source, user owned and censorship resistant media.',
  image: 'https://dehub.io/og-image.png',
  url: 'https://dehub.io',
};

export function SEOHead({
  title,
  description = defaults.description,
  image = defaults.image,
  url,
  type = 'website',
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | DeHub` : defaults.title;
  const canonicalUrl = url || defaults.url;

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
    </Helmet>
  );
}
