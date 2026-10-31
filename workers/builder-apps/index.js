// dehub-builder-apps — serves every DeHub Builder app on its own origin,
// https://<slug>.dhb.gg.
//
// The bytes come from the builder-serve edge function (builder_files is the
// source of truth). Supabase's functions origin downgrades text/html to
// text/plain, so builder-serve reports the real type in x-builder-content-type
// and this Worker re-emits the body under it.
//
// Private apps open only through the signed path the owner gets from
// builder-api: /~t/<token>/<file>. The token rides in the path, not a cookie,
// so relative assets inherit it and it works inside a cross-site iframe.
//
// The apex (dhb.gg), www and docs are not apps: the route
// is *.dhb.gg/* and www passes straight through to its origin.

const FUNCTIONS = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/builder-serve';
const APPS_DOMAIN = 'dhb.gg';
const PASS_THROUGH = new Set(['www', 'docs']);

function page(status, title, message) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><p style="font-size:18px;margin:0 0 8px">${title}</p><p style="color:#949499;margin:0">${message}</p><p style="margin-top:20px"><a style="color:#e5e5e5" href="https://dehub.io/builder">Build your own on DeHub</a></p></div>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const labels = host.split('.');
    // Only <slug>.dhb.gg — deeper names and the reserved hosts are not apps.
    if (!host.endsWith(`.${APPS_DOMAIN}`) || labels.length !== 3 || PASS_THROUGH.has(labels[0])) {
      return fetch(request);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const slug = labels[0];

    let path = url.pathname;
    let token = '';
    const signed = /^\/~t\/([A-Za-z0-9_.-]+)(\/.*)?$/.exec(path);
    if (signed) {
      token = signed[1];
      if (!signed[2]) return Response.redirect(`${url.origin}/~t/${token}/`, 301);
      path = signed[2];
    }

    const upstream = new URL(FUNCTIONS);
    upstream.searchParams.set('host', slug);
    if (path === '/.well-known/dehub.json') {
      upstream.searchParams.set('manifest', '1');
    } else {
      let file = decodeURIComponent(path.replace(/^\/+/, ''));
      if (!file || file.endsWith('/')) file += 'index.html';
      upstream.searchParams.set('path', file);
    }
    if (token) upstream.searchParams.set('t', token);

    const res = await fetch(upstream.toString(), { cf: { cacheTtl: 0 } });
    if (res.status === 404) {
      const reason = await res.text();
      if (/private/i.test(reason)) return page(404, 'This app is private', 'Only its creator can open it.');
      if (path === '/' || path.endsWith('.html')) return page(404, 'App not found', 'There is no DeHub app at this address.');
      return new Response('Not found', { status: 404 });
    }

    const isPrivate = res.headers.get('x-builder-private') === '1';
    const headers = new Headers({
      'Content-Type': res.headers.get('x-builder-content-type') || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Access-Control-Allow-Origin': '*',
    });
    const version = res.headers.get('x-builder-version');
    if (version) headers.set('ETag', `W/"v${version}-${path}"`);
    if (isPrivate || token) headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(request.method === 'HEAD' ? null : res.body, { status: res.status, headers });
  },
};
