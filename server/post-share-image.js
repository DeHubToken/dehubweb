import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { POST_CARD_TTL, POST_CARD_VERSION, textPostCardData, renderPostCardSvg } from './post-share-card.js';

let initialized;
let assets;
const RENDER_REVISION = 2;
const bytesToUri = (bytes, type) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${type};base64,${btoa(binary)}`;
};

async function loadAssets(env) {
  if (!assets) assets = Promise.all(['/brand-kit/font/exo-500.ttf', '/brand/mark-white.png'].map(async (path) => {
    const response = await env.ASSETS.fetch(new Request(`https://dehub.io${path}`));
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Share card asset unavailable');
    return new Uint8Array(await response.arrayBuffer());
  })).catch((error) => { assets = undefined; throw error; });
  return assets;
}

async function loadAvatar(url) {
  if (!url) return '';
  try {
    const source = new URL(url);
    if (source.origin !== 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com' || !source.pathname.startsWith('/avatars/')) return '';
    // Read the public object directly: the CDN's browser challenge can reject
    // a server-side request even though the same avatar loads in the app.
    source.hostname = 'dehubcdn.ams3.digitaloceanspaces.com';
    // Workers supports manual/follow, not redirect:error. Reject redirects
    // through response.ok so an avatar cannot move the request to another host.
    const response = await fetch(source.href, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
    if (!response.ok || Number(response.headers.get('Content-Length')) > 1_000_000) return '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 1_000_000) return '';
    const type = bytes[0] === 137 && bytes[1] === 80 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : '';
    return type ? bytesToUri(bytes, type) : '';
  } catch { return ''; }
}

export async function handlePostShareImage(request, env, ctx, tokenId, fetchRecord) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  try {
    // Fetch anonymously before consulting the image cache: edits, counts and
    // restrictions must all be checked against the current record.
    const record = await fetchRecord(tokenId);
    if (!record) return new Response('Post unavailable', { status: 404, headers });
    const data = textPostCardData(record);
    if (!data || data.tokenId !== tokenId) return new Response('No public text preview', { status: 404, headers });
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ revision: RENDER_REVISION, data })));
    const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    const key = new Request(`https://dehub.io/_og/post/${POST_CARD_VERSION}/${tokenId}.png?data=${fingerprint}`);
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const cached = await cache?.match(key);
    if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;
    initialized ??= initWasm(wasm).catch((error) => { initialized = undefined; throw error; });
    const [, [font, mark], avatar] = await Promise.all([initialized, loadAssets(env), loadAvatar(data.avatar)]);
    const svg = renderPostCardSvg(data, { logo: bytesToUri(mark, 'image/png'), avatar });
    const renderer = new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: 'Exo' } });
    let rendered;
    let png;
    try { rendered = renderer.render(); png = rendered.asPng(); }
    finally { rendered?.free(); renderer.free(); }
    const response = new Response(png, { headers: {
      ...headers, 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=60, s-maxage=${POST_CARD_TTL}`,
      'ETag': `"${POST_CARD_VERSION}-${fingerprint}"`, 'X-DeHub-Share-Card': POST_CARD_VERSION,
      'X-DeHub-Post-Counts': `${data.likes},${data.comments},${data.views}`,
      'X-DeHub-Post-Avatar': avatar ? 'image' : 'initials',
    } });
    if (cache) ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    console.error('[Post share image]', error);
    return new Response('Share image temporarily unavailable', { status: 503, headers: { ...headers, 'Retry-After': '30' } });
  }
}
