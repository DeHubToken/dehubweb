import { localizePageJsonLd } from '../../server/public-page-locales.js';
import { useLocation } from 'react-router-dom';
import { usePublicPageLocale } from '@/hooks/usePublicPageLocale';
import { localizedPageUrl, writeLanguageAlternates } from '@/lib/seo/public-locales';
import { useContext, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { removeCanonical, upsertCanonical, upsertMeta, upsertSocialMeta, setRobots, setJsonLd, setTdmReservation } from '@/lib/head-meta';
import { HUB_ROUTE_META, SHARE_IMAGE, SITE_URL, canonicalUrl as toCanonicalUrl } from '@/lib/seo/route-meta';
import type { AiScrapingPreference } from '@/lib/ai-scraping';

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
  /** Write no canonical at all — for pages that are not a real URL (a missing
   *  profile, the 404). A canonical on a noindexed page is a mixed signal. */
  noCanonical?: boolean;
  /**
   * The page's owning creator's AI-scraping preference — pass it on a
   * profile or a single-post page whose creator has one. Leave undefined on
   * every page with no single creator to ask (feeds, marketing, etc.); the
   * absence of a preference is not the same as a denial and must not be
   * asserted as one.
   */
  aiScraping?: AiScrapingPreference;
}

export function SEOHead({
  title,
  description,
  image = SHARE_IMAGE,
  url,
  type = 'website',
  jsonLd,
  noindex = false,
  noCanonical = false,
  aiScraping,
}: SEOHeadProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const page = usePublicPageLocale(location.pathname);
  // Hidden cached pages stay mounted; if they kept rendering Helmet, whichever
  // page happened to render last would own the tab title for every route.
  const isActivePage = useContext(CachedPageActiveContext);
  // Defaults are the homepage's — the same strings the worker serves for "/".
  const fullTitle = page.data?.title || title || t(HUB_ROUTE_META.home.titleKey);
  const desc = page.data?.description ?? description ?? t(HUB_ROUTE_META.home.descriptionKey);
  // Canonical self-references the route but always on the canonical host with
  // no query/hash: preview mirror hosts and ?param variants must
  // consolidate to the clean dehub.io URL, never self-canonicalize. Explicit
  // URLs go through the same rules (lib/seo/route-meta), so a page naming its
  // /app twin still declares the URL the worker declares for it.
  const currentUrl = typeof window !== 'undefined' ? `${SITE_URL}${window.location.pathname}` : '';
  const canonicalUrl = page.localized && !noindex
    ? localizedPageUrl(page.route, page.language)
    : toCanonicalUrl(url || currentUrl || SITE_URL);
  // A top-level JSON-LD `url` names the same page, so it follows the canonical.
  const ld =
    jsonLd && page.data ? localizePageJsonLd(jsonLd, page.route, page.language, page.data)
      : jsonLd ? { ...jsonLd, inLanguage: page.language, ...(typeof jsonLd.url === 'string' ? { url: canonicalUrl } : {}) } : jsonLd;

  // react-helmet-async (v3) renders nothing in this app: every route was left
  // on the static index.html title, so tabs and bookmarks were all identical.
  // Write the document-level bits ourselves so the head is never at the mercy
  // of the library — that includes og:/twitter:, robots and JSON-LD, which were
  // previously Helmet-only and therefore never reached the DOM at all. Only the
  // active page may write — with ~30 pages held mounted by PersistentPageCache,
  // hidden ones would otherwise stomp the real tags.
  const jsonLdString = ld ? JSON.stringify(ld) : null;
  useEffect(() => {
    if (!isActivePage) return;
    document.title = fullTitle;
    writeLanguageAlternates(page.route, page.language, !noindex && !noCanonical);
    if (noCanonical) removeCanonical();
    else upsertCanonical(canonicalUrl);
    upsertMeta('name', 'description', desc);
    upsertSocialMeta({ title: fullTitle, description: desc, url: noCanonical ? null : canonicalUrl, image, type });
    setRobots(noindex, aiScraping === 'deny' ? 'noai, noimageai' : undefined);
    setTdmReservation(aiScraping === undefined ? null : aiScraping === 'deny' ? '1' : '0');
    setJsonLd(jsonLdString);
  }, [isActivePage, fullTitle, canonicalUrl, noCanonical, desc, image, type, noindex, jsonLdString, aiScraping, page.route, page.language]);

  if (!isActivePage) return null;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {!noCanonical && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />
      {!noCanonical && <meta property="og:url" content={canonicalUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />

      {jsonLdString && (
        <script type="application/ld+json">
          {jsonLdString}
        </script>
      )}
    </Helmet>
  );
}
