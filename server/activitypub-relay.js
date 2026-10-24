/**
 * ActivityPub on dehub.io.
 *
 * Federated ids live on dehub.io (that is the domain in an @alice@dehub.io
 * handle), but the state — keys, remote followers, delivery — lives in the API
 * (dehub-stream-backend src/activitypub). The Worker passes these requests
 * through to /api/ap/* unchanged, plus the host and path the sender signed:
 * the API checks HTTP signatures against those, and behind this hop it would
 * otherwise see its own.
 *
 *   /.well-known/webfinger  -> /api/ap/webfinger
 *   /.well-known/nodeinfo   -> /api/ap/nodeinfo-links
 *   /ap/...                 -> /api/ap/...
 *
 * And when another server asks a human page for ActivityPub (Accept:
 * application/activity+json) — someone pasted a DeHub link into Mastodon's
 * search — the profile and post pages answer with their actor and Note.
 */

const AP_TYPES = /application\/(activity\+json|ld\+json)/i;

export function wantsActivityJson(accept) {
  return AP_TYPES.test(String(accept || ''));
}

/**
 * The API path to relay to, or null when this is not an ActivityPub request.
 * `isProfileSegment` says whether a single path segment can be a username.
 */
export function apRelayTarget(pathname, accept, isProfileSegment) {
  if (pathname === '/.well-known/webfinger') return '/api/ap/webfinger';
  if (pathname === '/.well-known/nodeinfo') return '/api/ap/nodeinfo-links';
  if (pathname === '/ap' || pathname.startsWith('/ap/')) return `/api${pathname}`;
  if (!wantsActivityJson(accept)) return null;
  const post = /^\/posts?\/(\d+)\/?$/.exec(pathname);
  if (post) return `/api/ap/posts/${post[1]}`;
  const profile = /^\/@?([^/]+)\/?$/.exec(pathname);
  if (profile) {
    // A malformed escape is not a username; let the page route handle it.
    let segment;
    try { segment = decodeURIComponent(profile[1]); } catch { return null; }
    if (!isProfileSegment || isProfileSegment(segment)) return `/api/ap/users/${encodeURIComponent(segment.replace(/^@/, ''))}`;
  }
  return null;
}

/** The headers passed on: what a signature covers, and where it was signed. */
export function apRelayHeaders(request, url) {
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'date', 'digest', 'signature', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-ap-host', url.host);
  headers.set('x-ap-path', `${url.pathname}${url.search}`);
  return headers;
}

export async function handleApRelay(request, target, apiOrigin) {
  const url = new URL(request.url);
  const method = request.method === 'POST' ? 'POST' : 'GET';
  let upstream;
  try {
    upstream = await fetch(`${apiOrigin}${target}${url.search}`, {
      method,
      headers: apRelayHeaders(request, url),
      body: method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch {
    // An unreachable API is a 502 to the remote server, not a Worker crash.
    return new Response('Bad Gateway', { status: 502, headers: { 'access-control-allow-origin': '*' } });
  }
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'location']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // WebFinger and NodeInfo are read from browsers too (web Mastodon clients).
  headers.set('access-control-allow-origin', '*');
  headers.set('vary', 'Accept');
  return new Response(upstream.body, { status: upstream.status, headers });
}
