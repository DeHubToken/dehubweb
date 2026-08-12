/**
 * Usernames nobody may claim, because something else already answers at that
 * URL. Profiles live at dehub.io/:username, which is the LAST route in the
 * router — every static path above it wins, and the edge worker intercepts a
 * further set before React ever boots. A user who claims one of these gets a
 * profile page that is unreachable forever, and the URL they hold is one the
 * product uses for itself.
 *
 * This file is the single source of truth for that set. It is plain JS on
 * purpose: CLOUDFLARE_WORKER_SEO.js imports it too, and that file is bundled by
 * wrangler (esbuild), not by vite. Both sides reading one list is the point —
 * the worker's SYSTEM_ROUTES and the app's reserved list used to be maintained
 * by hand and drifted apart in both directions, which is how /apk, /arcade,
 * /stats, /stages, /connect, /pricing and /mcp each shipped as a route that the
 * worker then read as a username and 404'd to crawlers.
 *
 * Two exports, because the two consumers need different sets:
 *
 *   ROUTE_SEGMENTS      paths that really exist. The worker uses this to decide
 *                       "this first segment is not a profile". It must stay
 *                       exact — every name added here stops being crawlable as
 *                       a profile, so putting a speculative name in this list
 *                       de-indexes a real user who already holds it.
 *   RESERVED_USERNAMES  what signup refuses. A superset: the routes above plus
 *                       names we simply do not want a stranger holding. Safe to
 *                       grow, because it only gates NEW claims.
 *
 * IMPORTANT: this is still only a client-side and edge-side guard. The API
 * (`/api/username/check` and `/api/update_profile` on api.dehub.io) enforces
 * none of it, so a direct POST can still claim any name here. Closing that is
 * the server-side half of this fix — see the PR description.
 */

/**
 * Top-level paths owned by the SPA router (src/App.tsx), plus the `/app`
 * children (canonicalizePath in the worker collapses `/app/<x>` onto `/<x>`,
 * so they share the same URL space), plus the edge-only surfaces and the
 * worker's redirect tables. Anything that answers at `dehub.io/<segment>`.
 */
export const ROUTE_SEGMENTS = [
  // --- SPA top-level routes (src/App.tsx) ---
  'admin', 'affiliate', 'agents', 'apk', 'app', 'arcade', 'assistant',
  'auth', 'bridge', 'communities', 'connect', 'creator', 'creators',
  'delete-account', 'docs', 'editor', 'events', 'explore', 'features',
  'governance', 'guide', 'guides', 'jobs', 'launchpad', 'leaderboard',
  'mcp', 'mobile-preview', 'music', 'premium', 'pricing', 'prompt', 'r',
  'radio', 'shorts', 'stage', 'stages', 'stake', 'stats', 'top-100', 'tv',
  'videos', 'work',

  // --- /app children. Not top-level routes, but the worker canonicalises
  // /app/<x> onto /<x>, so they resolve into the same space. Several were
  // already in the worker's list for exactly this reason. ---
  'ads', 'bookmarks', 'buy', 'command-centre', 'glossary', 'messages',
  'notifications', 'post', 'profile', 'settings', 'stores', 'video', 'wallet',

  // --- Edge-only surfaces: served by the worker, never reach the router ---
  'blog', 'rss', 'sitemap', 'robots',

  // --- Worker redirect tables (LEGAL_REDIRECTS / SPA_REDIRECTS) ---
  'legal', 'privacy', 'privacy-policy', 'terms', 'terms-of-service',
];

/**
 * Names that are not routes but must not be handed to a stranger: a profile at
 * dehub.io/support or dehub.io/official reads as DeHub speaking.
 *
 * Deliberately NOT given to the worker. These are claimable-looking names, and
 * if any existing account already holds one, treating it as a system route
 * would silently stop that real profile from rendering for crawlers and
 * unfurls. Blocking new claims is the whole intent.
 */
export const RESERVED_VANITY_NAMES = [
  'about', 'account', 'accounts', 'api', 'billing', 'contact', 'dehub',
  'help', 'home', 'login', 'logout', 'me', 'moderator', 'official',
  'register', 'root', 'security', 'signin', 'signup', 'staff', 'status',
  'support', 'system', 'team', 'undefined', 'null',
];

/** Everything signup refuses. */
export const RESERVED_USERNAMES = new Set([
  ...ROUTE_SEGMENTS,
  ...RESERVED_VANITY_NAMES,
]);

/**
 * Paths the worker must never read as a username but which are assets rather
 * than claimable names. Kept separate so they do not clutter the username
 * rules; the worker unions them with ROUTE_SEGMENTS.
 */
export const WORKER_ASSET_ROUTES = [
  '_netlify', 'assets', 'favicon.ico', 'og-image.png', 'og', 'skill.md',
  'docs-content', 'blog-content', 'version.json',
];

/**
 * Normalise the way a username is compared. The stored form is lowercase, but
 * inputs arrive with an `@`, with padding, and — from the mobile edit screen,
 * which does not sanitise its TextInput — in mixed case. Router matching is
 * case-insensitive, so `App` collides with `/app` exactly as `app` does.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/**
 * True when `value` may not be claimed. Callers should treat a `true` here as
 * final and not fall through to the availability API, which does not know
 * about any of this.
 *
 * Only ever call this on a username the user is trying to TAKE. Existing
 * holders of a name that later became reserved must not be blocked from
 * editing the rest of their profile.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isReservedUsername(value) {
  const name = normalizeUsername(value);
  if (!name) return false;

  if (RESERVED_USERNAMES.has(name)) return true;

  // Anything with a dot is read as a file by the worker (`skill.md`,
  // `favicon.ico`), never as a profile.
  if (name.includes('.')) return true;

  // `/app/...` twins: the worker collapses /app/<x> onto /<x>, so a name in
  // that shape reaches the same URL space from two directions.
  if (name.startsWith('app-') || name.startsWith('app_')) return true;

  return false;
}
