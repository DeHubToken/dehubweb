import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { getDocsSeoForPath } from "@/lib/docs/seo";
import { upsertCanonical, upsertMeta, upsertSocialMeta, setJsonLd, setRobots } from "@/lib/head-meta";

const DOCS_OG_IMAGE =
  "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo//new_logo_Dehub.jpg";

/**
 * Per-route SEO for every /docs section: title, description, canonical,
 * Open Graph, Twitter card and Article JSON-LD. Mounted once inside DocsLayout
 * so it reacts to every nested route change.
 */
export function DocsSEO() {
  const { pathname } = useLocation();
  const { entry, canonical } = getDocsSeoForPath(pathname);

  // Same reason as SEOHead: react-helmet-async (v3) emits nothing here, so every
  // docs page sat on the static index.html title. Write the whole head set
  // directly — og:/twitter:/JSON-LD included, which Helmet never emitted.
  // Blog posts overwrite these after their data loads (BlogPost renders
  // SEOHead once the post arrives, and a later imperative write wins).
  useEffect(() => {
    document.title = entry.title;
    upsertCanonical(canonical);
    upsertMeta("name", "description", entry.description);
    // Docs pages are indexable — restore robots in case the previous route
    // (launchpad, referral, 404…) left a noindex behind on SPA navigation.
    setRobots(false);
    upsertSocialMeta({
      title: entry.title,
      description: entry.description,
      url: canonical,
      image: DOCS_OG_IMAGE,
      type: "article",
    });
    setJsonLd(
      JSON.stringify({
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
      })
    );
  }, [entry.title, entry.description, canonical]);

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
