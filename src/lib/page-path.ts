/**
 * Route-shape normalisation for page view tracking.
 *
 * A raw pathname is not a useful analytics key — /app/post/123 and
 * /app/post/124 are the same page visited twice, and the id half is somebody's
 * content. Reducing a path to its route shape both groups the counts and keeps
 * ids, wallet addresses and usernames out of the table entirely.
 *
 * Query strings and fragments are dropped whole: they carry search terms,
 * referral codes and auth fragments, none of which belong in an analytics row.
 */

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;

// Anything this long is an id of some kind (a token hash, a slug with a
// trailing uuid, a base64 blob), not a route segment somebody typed.
const MAX_SEGMENT = 24;

function normaliseSegment(segment: string): string {
  if (NUMERIC.test(segment)) return ':id';
  if (ADDRESS.test(segment)) return ':address';
  if (UUID.test(segment)) return ':id';
  if (segment.length > MAX_SEGMENT) return ':slug';
  return segment;
}

/** The route shape of a pathname, e.g. `/app/post/123` → `/app/post/:id`. */
export function normalisePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';

  const segments = pathname
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter(Boolean)
    .slice(0, 8)
    .map(normaliseSegment);

  return `/${segments.join('/')}`.toLowerCase();
}

/**
 * The host a visitor arrived from, or null for a direct hit or an in-app
 * navigation. Only the host — a full referrer URL can carry the query string
 * of whatever page linked here.
 */
export function referrerHost(referrer: string | undefined, selfHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).host;
    return host && host !== selfHost ? host.slice(0, 120) : null;
  } catch {
    return null;
  }
}
