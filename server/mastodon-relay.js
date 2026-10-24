/**
 * Mastodon apps on dehub.io.
 *
 * An app signing in to "dehub.io" calls the Mastodon client API on that host:
 * /api/v1/…, /api/v2/…, /oauth/token, /oauth/revoke. The API itself lives in
 * dehub-stream-backend (src/mastodon) under /api/mastodon/…; the Worker passes
 * these through, with the public path the app called so the API can write
 * Link headers the app can follow.
 *
 *   /api/v1/*                                -> /api/mastodon/v1/*
 *   /api/v2/*                                -> /api/mastodon/v2/*
 *   /oauth/token, /oauth/revoke              -> /api/mastodon/oauth/…
 *   /.well-known/oauth-authorization-server  -> /api/mastodon/oauth/metadata
 *
 * /oauth/authorize is not here: it is a page (src/pages/OAuthAuthorizePage),
 * because approving needs the person signed in to DeHub.
 *
 * Browser-based apps (Elk, Phanpy) call from their own origin, so every answer
 * allows any origin and the preflight is answered here.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, Idempotency-Key',
  'access-control-expose-headers': 'Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
  'access-control-max-age': '86400',
};

/** The API path for a Mastodon client request, or null when it is not one. */
export function mastodonRelayTarget(pathname) {
  if (/^\/api\/v[12]\/./.test(pathname)) return `/api/mastodon${pathname.slice('/api'.length)}`;
  if (pathname === '/oauth/token' || pathname === '/oauth/revoke') return `/api/mastodon${pathname}`;
  if (pathname === '/.well-known/oauth-authorization-server') return '/api/mastodon/oauth/metadata';
  return null;
}

/** What is passed on: the app's credentials and body type, and the path it called. */
export function mastodonRelayHeaders(request, url) {
  const headers = new Headers();
  for (const name of ['accept', 'authorization', 'content-type', 'idempotency-key', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-mastodon-path', `${url.pathname}${url.search}`);
  return headers;
}

export async function handleMastodonRelay(request, target, apiOrigin) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const upstream = await fetch(`${apiOrigin}${target}${url.search}`, {
    method: request.method,
    headers: mastodonRelayHeaders(request, url),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const headers = new Headers(CORS);
  for (const name of ['content-type', 'cache-control', 'link', 'location']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}
