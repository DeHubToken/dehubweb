const HOSTS = new Set(['dehub.io', 'origin.dehub.io']);
const HEADERS = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** Runs before application routes so an unavailable origin cannot hide the notice. */
export async function edgeMaintenanceResponse(request, env) {
  if (env.MAINTENANCE_MODE !== 'true') return null;
  const url = new URL(request.url);
  if (!HOSTS.has(url.hostname)) return null;
  const path = url.pathname;
  // These are local Worker assets, including the deployment receipt and app links.
  if (path.startsWith('/brand-kit/') || path.startsWith('/.well-known/') || path === '/version.json' || path === '/favicon.ico') return null;

  if (path === '/maintenance.json') {
    const headers = { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ enabled: env.MOBILE_MAINTENANCE_MODE !== 'false' }), { headers });
  }

  const headers = { ...HEADERS, 'Retry-After': '120', 'X-DeHub-Maintenance': 'edge' };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type',
    } });
  }
  if (!['GET', 'HEAD'].includes(request.method) || /^\/(?:_api|api|_supabase)(?:\/|$)/.test(path)) {
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: 'MAINTENANCE', message: 'DeHub is temporarily offline for maintenance.' }), {
      status: 503, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const page = await env.ASSETS.fetch(new Request(new URL('/maintenance-edge.html', url), { method: 'GET' }));
  if (!page.ok) return new Response(request.method === 'HEAD' ? null : 'DeHub is temporarily offline for maintenance.', { status: 503, headers });
  return new Response(request.method === 'HEAD' ? null : page.body, {
    status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
