/**
 * One source for the URLs and head strings the SPA shares with the SEO worker
 * (CLOUDFLARE_WORKER_SEO.js).
 *
 * Crawlers get the worker's prerendered page; people get this app. When the
 * two describe one URL differently — /explore canonicalising to /app/explore
 * here and the reverse there — Google is handed two canonicals pointing at each
 * other and trusts neither. So the SPA follows the worker's rules exactly, and
 * src/test/route-meta.test.ts fails when either side drifts.
 */

export const SITE_URL = 'https://dehub.io';

/** The worker's default 1200x630 share card (SHARE_IMAGE). */
export const SHARE_IMAGE = `${SITE_URL}/og/dehub-social-share.png`;

/**
 * Route keys whose /app/<key> twin the worker collapses onto the bare /<key>:
 * SSR_STATIC_ROUTES, SECTION_PAGES and MARKETING_PAGES. Pages in all three are
 * rendered with a canonical of `/${key}`, so the app must say the same.
 */
export const BARE_CANONICAL_KEYS: ReadonlySet<string> = new Set([
  // SECTION_PAGES
  'explore', 'videos', 'shorts',
  // SSR_STATIC_ROUTES
  'features', 'pricing', 'depin', 'creator', 'editor', 'prompt', 'work',
  'affiliate', 'premium', 'governance', 'leaderboard', 'top-100', 'dao',
  'music', 'radio', 'tv', 'bridge', 'agents', 'assistant', 'creators', 'jobs',
  'usernames', 'arcade', 'accounts', 'converter', 'events', 'launchpad', 'stats',
  'migrate-youtube', 'stores', 'fractions', 'superpowers', 'glossary', 'ads', 'buy',
  // MARKETING_PAGES not already listed
  'dex', 'builder', 'connect', 'connect/chatgpt', 'connect/claude', 'communities',
  'stages', 'apps', 'apps/dev', 'arcade/gods-eye', 'arcade/kings-gambit',
  'arcade/claude-of-duty', 'arcade/jungle-trail', 'arcade/street-slayer',
  'arcade/trenchstar', 'guide', 'apk', 'admin-manual', 'packs', 'cinema', 'stake',
  'raffle',
]);

/**
 * Canonical path for a pathname, mirroring the worker:
 * - trailing slashes dropped;
 * - /app/<key> and /<Key> collapse onto the bare, lower-case /<key> for every
 *   worker-rendered page;
 * - every post shape (/post/:id, /posts/:id[/b[/x]], /video/:id) collapses onto
 *   /app/post/:id, the form the post pages and the post sitemap use;
 * - /communities/:slug collapses onto /app/communities/:slug (invite links at
 *   /communities/join/:code are left alone, as the worker leaves them);
 * - /stores/:id is canonical bare, so /app/stores/:id collapses onto it;
 * - a single cinema title canonicalises onto /cinema (the worker has no
 *   per-title metadata, so it serves the /cinema card for every title).
 */
export function canonicalPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  const noApp = p.replace(/^\/app(?=\/)/, '');
  const key = noApp.replace(/^\/+/, '').toLowerCase();
  if (BARE_CANONICAL_KEYS.has(key)) return `/${key}`;

  const post = noApp.match(/^\/(?:post|posts|video)\/(\d+)(?:\/b(?:\/[^/]+)?)?$/i);
  if (post) return `/app/post/${post[1]}`;

  const community = noApp.match(/^\/communities\/([^/]+)$/i);
  if (community && community[1].toLowerCase() !== 'join') return `/app/communities/${community[1]}`;

  const store = p.match(/^\/app\/stores\/([^/]+)$/i);
  if (store) return `/stores/${store[1]}`;

  if (/^\/cinema\/(?:film|series|movie|show)\/[^/]+$/i.test(noApp)) return '/cinema';

  return p;
}

/**
 * Canonical absolute URL for a dehub.io URL or a bare path. Query strings
 * survive only on explicit URLs (a store listing's ?listing=, a feature's
 * ?feature=) — the path is what gets normalised. Anything on another host is
 * returned untouched.
 */
export function canonicalUrl(urlOrPath: string): string {
  let parsed: URL;
  try {
    parsed = new URL(urlOrPath, SITE_URL);
  } catch {
    return urlOrPath;
  }
  if (parsed.hostname !== 'dehub.io') return urlOrPath;
  return `${SITE_URL}${canonicalPath(parsed.pathname)}${parsed.search}`;
}

export interface HubRouteMeta {
  /** Canonical URL — the one the worker's page for this route declares. */
  url: string;
  /** i18n keys; the English values are the worker's strings verbatim. */
  titleKey: string;
  descriptionKey: string;
  /** The page's H1, where the app renders one for the route. */
  headingKey?: string;
}

/**
 * Head strings for the hub routes. Titles and descriptions are the worker's
 * (HOME_TITLE / HOME_DESCRIPTION, SECTION_PAGES, the docs index) so the tab a
 * person sees and the result a crawler indexes carry the same words.
 */
export const HUB_ROUTE_META = {
  home: { url: `${SITE_URL}/`, titleKey: 'home.seoTitle', descriptionKey: 'home.seoDescription', headingKey: 'home.seoTitle' },
  explore: { url: `${SITE_URL}/explore`, titleKey: 'explore.seoTitle', descriptionKey: 'explore.seoDescription' },
  videos: { url: `${SITE_URL}/videos`, titleKey: 'videos.seoTitle', descriptionKey: 'videos.seoDescription', headingKey: 'videos.heading' },
  shorts: { url: `${SITE_URL}/shorts`, titleKey: 'shorts.seoTitle', descriptionKey: 'shorts.seoDescription', headingKey: 'shorts.heading' },
  docs: { url: `${SITE_URL}/docs`, titleKey: 'docs.seoTitle', descriptionKey: 'docs.seoDescription' },
} as const satisfies Record<string, HubRouteMeta>;
