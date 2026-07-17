import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { getDocsSeoForPath } from "@/lib/docs/seo";

/**
 * Per-route SEO for every /docs section: title, description, canonical,
 * Open Graph, Twitter card and Article JSON-LD. Mounted once inside DocsLayout
 * so it reacts to every nested route change.
 */
export function DocsSEO() {
  const { pathname } = useLocation();
  const { entry, canonical } = getDocsSeoForPath(pathname);

  return (
    <Helmet>
      <title>{entry.title}</title>
      <meta name="description" content={entry.description} />
      {entry.keywords ? <meta name="keywords" content={entry.keywords} /> : null}
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="article" />
      <meta property="og:title" content={entry.title} />
      <meta property="og:description" content={entry.description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content="DeHub Docs" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={entry.title} />
      <meta name="twitter:description" content={entry.description} />

      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: entry.title,
          description: entry.description,
          url: canonical,
          inLanguage: "en",
          isPartOf: {
            "@type": "WebSite",
            name: "DeHub Docs",
            url: "https://dehub.io/docs",
          },
        })}
      </script>
    </Helmet>
  );
}
