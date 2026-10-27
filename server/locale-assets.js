/** Preserve versioned URLs held by older clients after generated copies expire. */
export async function serveLocaleAsset(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/locale-pages\/([a-f0-9]{16})\/(.+\.json)$/);
  if (!match || !['GET', 'HEAD'].includes(request.method)) return null;
  const headers = { Accept: 'application/json' };
  const original = await env.ASSETS.fetch(new Request(url, { method: request.method, headers }));
  if (original.ok && original.headers.get('Content-Type')?.includes('application/json')) return original;
  const pointer = await env.ASSETS.fetch(new URL('/locale-pages/current.json', url), { headers });
  if (!pointer.ok || !pointer.headers.get('Content-Type')?.includes('application/json')) return original;
  const { version } = await pointer.json();
  if (!/^[a-f0-9]{16}$/.test(version) || version === match[1]) return original;
  url.pathname = `/locale-pages/${version}/${match[2]}`;
  const latest = await env.ASSETS.fetch(new Request(url, { method: request.method, headers }));
  if (!latest.ok || !latest.headers.get('Content-Type')?.includes('application/json')) return original;
  const response = new Response(latest.body, latest);
  // This old URL follows current copy; it must not inherit immutable caching.
  response.headers.set('Cache-Control', 'public, max-age=300');
  response.headers.set('X-Locale-Version', version);
  return response;
}
