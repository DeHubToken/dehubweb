const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export function result(status, body) {
  return Response.json(body, { status, headers });
}

// Fixed public endpoints only. Never forward visitor headers, credentials,
// query parameters or bodies. This is a reachability test, not an API relay.
export async function probe(kind, fetcher = fetch) {
  const target = kind === 'web' ? 'https://staging.dehub.io/app'
    : kind === 'api' ? 'https://api.dehub.io/api/health' : null;
  if (!target) return result(404, { status: 'not_found' });
  const started = Date.now();
  try {
    const response = await fetcher(target, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return result(502, { status: 'upstream_failed', upstreamStatus: response.status });
    const valid = kind === 'web'
      ? (response.headers.get('content-type') || '').includes('text/html') && (await response.text()).includes('id="root"')
      : (await response.json()).status === 'ok';
    return result(valid ? 200 : 502, { status: valid ? 'ok' : 'invalid_response', target: kind, elapsedMs: Date.now() - started });
  } catch {
    return result(502, { status: 'upstream_unreachable', target: kind });
  }
}
