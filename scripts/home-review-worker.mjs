/** Isolated branch preview. No production routes or deployment bindings. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n');
    }
    if (url.pathname.startsWith('/_api/')) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
      const upstream = new URL(url.pathname.slice('/_api'.length) + url.search, 'https://api.dehub.io');
      const headers = new Headers(request.headers);
      headers.set('Origin', 'https://dehub.io');
      headers.set('Referer', 'https://dehub.io/');
      headers.delete('Cookie');
      const response = await fetch(upstream, {
        method: request.method, headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      });
      const result = new Response(response.body, response);
      result.headers.delete('Set-Cookie');
      result.headers.delete('Access-Control-Allow-Origin');
      result.headers.set('Cache-Control', 'no-store');
      result.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return result;
    }
    const response = await env.ASSETS.fetch(request);
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  },
};
