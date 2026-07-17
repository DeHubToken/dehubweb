import React from 'react';
import { Helmet } from 'react-helmet-async';

// Additional SEO enhancements for blog pages
export const BlogSEOHelper: React.FC = () => {
  const isCanonicalHost = ['dehub.io', 'localhost', '127.0.0.1'].includes(window.location.hostname);
  return (
    <Helmet>
      {/* Enhanced meta tags for blog indexing — never re-open indexing on mirror hosts */}
      <meta
        name="googlebot"
        content={isCanonicalHost ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' : 'noindex, nofollow'}
      />
      <meta name="bingbot" content={isCanonicalHost ? 'index, follow' : 'noindex, nofollow'} />

      {/* RSS/Feed discovery */}
      <link rel="alternate" type="application/rss+xml" title="DeHub Blog RSS Feed" href="/rss.xml" />

      {/* Preconnect to external domains for faster loading */}
      <link rel="preconnect" href="https://images.unsplash.com" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />

      {/* Additional structured data for search engines */}
      <meta name="theme-color" content="#2563eb" />
      <meta name="msapplication-TileColor" content="#2563eb" />

      {/* Social media optimization */}
      <meta name="twitter:domain" content="dehub.io" />
    </Helmet>
  );
};
