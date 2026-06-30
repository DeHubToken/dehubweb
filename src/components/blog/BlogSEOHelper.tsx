import React from 'react';
import { Helmet } from 'react-helmet-async';

// Additional SEO enhancements for blog pages
export const BlogSEOHelper: React.FC = () => {
  return (
    <Helmet>
      {/* Enhanced meta tags for blog indexing */}
      <meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      <meta name="bingbot" content="index, follow" />
      
      {/* RSS/Feed discovery */}
      <link rel="alternate" type="application/rss+xml" title="DeHub Blog RSS Feed" href="/rss.xml" />
      
      {/* Preconnect to external domains for faster loading */}
      <link rel="preconnect" href="https://images.unsplash.com" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      
      {/* Additional structured data for search engines */}
      <meta name="theme-color" content="#2563eb" />
      <meta name="msapplication-TileColor" content="#2563eb" />
      
      {/* Social media optimization */}
      <meta property="fb:app_id" content="your-facebook-app-id" />
      <meta name="twitter:domain" content="dehub.io" />
      
      {/* Google Search Console verification - replace with actual codes */}
      <meta name="google-site-verification" content="dehub-google-verification-placeholder" />
      
      {/* Bing Webmaster Tools verification - replace with actual codes */}
      <meta name="msvalidate.01" content="dehub-bing-verification-placeholder" />
    </Helmet>
  );
};