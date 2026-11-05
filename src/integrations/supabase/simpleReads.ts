/**
 * Signed-out table reads without a CORS preflight.
 *
 * supabase-js sends every request with `apikey`, `Authorization` and
 * `X-Client-Info` headers. None of those are on the browser's safe list, so
 * each new REST URL costs an OPTIONS round trip before the real GET: about
 * fifteen extra requests on a first visit to Home, every one waiting on the
 * one before it.
 *
 * When the request only carries the public key (nobody signed in to
 * Supabase), the same read works with the key in the query string and no
 * custom headers at all, which the browser sends straight away. The answer is
 * identical: the gateway treats `?apikey=` like the header, and without an
 * Authorization header it runs the read as the same anon role.
 *
 * Anything else is passed through untouched: writes, RPC calls, functions,
 * storage, a signed-in token, or any header that would still need a
 * preflight (Prefer for counts, Range, a non-public schema...).
 */

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Headers a browser sends cross-origin without asking first. */
const SAFE_HEADERS = new Set(['accept', 'accept-language', 'content-language']);
/** Headers this wrapper knows how to drop for an anon read. */
const DROPPED = new Set(['apikey', 'authorization', 'x-client-info']);

export function withSimpleAnonReads(next: FetchFn, anonKey: string): FetchFn {
  const anonBearer = `Bearer ${anonKey}`;
  return (input, init) => {
    if (typeof input !== 'string' && !(input instanceof URL)) return next(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' || init?.body != null) return next(input, init);

    let url: URL;
    try {
      url = new URL(String(input));
    } catch {
      return next(input, init);
    }
    if (!url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/rest/v1/rpc/')) return next(input, init);

    const headers = new Headers(init?.headers);
    if (headers.get('apikey') !== anonKey) return next(input, init);
    const auth = headers.get('authorization');
    if (auth && auth !== anonBearer) return next(input, init);
    // Reading the default schema needs no profile header.
    if (headers.get('accept-profile') === 'public') headers.delete('accept-profile');

    for (const name of DROPPED) headers.delete(name);
    for (const [name] of headers) {
      if (!SAFE_HEADERS.has(name.toLowerCase())) return next(input, init);
    }

    url.searchParams.set('apikey', anonKey);
    return next(url.href, { ...init, headers });
  };
}
