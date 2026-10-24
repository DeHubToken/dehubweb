import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { POST_CARD_TTL, POST_CARD_VERSION, PROFILE_CARD_VERSION, postCardData, profileCardData, renderPostCardSvg, renderProfileCardSvg } from './post-share-card.js';
import { loadPostShareDetails, streamerShareSvg } from './post-share-details.js';

const SHARE_IMAGE = 'https://dehub.io/og/dehub-social-share.png';
let initialized;
let assets;
const RENDER_REVISION = 8;
const bytesToUri = (bytes, type) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${type};base64,${btoa(binary)}`;
};

async function loadAssets(env) {
  if (!assets) assets = Promise.all(['/brand-kit/font/exo-500.ttf', '/brand/mark-white.png', '/brand/share-chrome-edge.png'].map(async (path) => {
    const response = await env.ASSETS.fetch(new Request(`https://dehub.io${path}`));
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Share card asset unavailable');
    return new Uint8Array(await response.arrayBuffer());
  })).catch((error) => { assets = undefined; throw error; });
  return assets;
}

async function loadCdnImage(url, { folder, limit, timeout, resize }) {
  if (!url) return '';
  try {
    const source = new URL(url);
    if (source.origin !== 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com' || (folder && !source.pathname.startsWith(folder))) return '';
    // `resize` asks the zone's image transform for a small JPEG, which also
    // turns WebP and GIF uploads into something the renderer decodes. The
    // transform only accepts the CDN host (its allowed source; the bare
    // Spaces host answers 9401), so it keeps that host.
    if (resize) {
      const resized = await readImage(source.href, { limit, timeout, cf: { image: resize } });
      if (resized) return resized;
    }
    // Otherwise read the public object directly: the CDN's browser challenge
    // can reject a server-side request even though the same avatar loads in the app.
    source.hostname = 'dehubcdn.ams3.digitaloceanspaces.com';
    return await readImage(source.href, { limit, timeout });
  } catch { return ''; }
}

async function readImage(href, { limit, timeout, cf }) {
  try {
    // Workers supports manual/follow, not redirect:error. Reject redirects
    // through response.ok so an avatar cannot move the request to another host.
    const response = await fetch(href, { signal: AbortSignal.timeout(timeout), redirect: 'manual', ...(cf ? { cf } : {}) });
    if (!response.ok || Number(response.headers.get('Content-Length')) > limit) { await response.body?.cancel(); return ''; }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) return '';
    const type = bytes[0] === 137 && bytes[1] === 80 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : '';
    return type ? bytesToUri(bytes, type) : '';
  } catch { return ''; }
}

const loadAvatar = (url) => loadCdnImage(url, { folder: '/avatars/', limit: 1_000_000, timeout: 3000 });
const loadPostMedia = (media) => loadCdnImage(media?.url, {
  limit: 4_000_000, timeout: 5000,
  resize: { width: 1484, height: 920, fit: 'cover', format: 'jpeg', quality: 82 },
});

/** The generic brand card, for any post that cannot or may not show its own. */
async function brandCard(request, env, headers, reason) {
  const response = await env.ASSETS.fetch(new Request(SHARE_IMAGE));
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) {
    return new Response('Share image temporarily unavailable', { status: 503, headers: { ...headers, 'Retry-After': '30' } });
  }
  if (request.method === 'HEAD') await response.body?.cancel();
  return new Response(request.method === 'HEAD' ? null : response.body, { headers: {
    ...headers, 'Content-Type': 'image/png', 'X-DeHub-Share-Card': 'brand', 'X-DeHub-Share-Fallback': reason,
    // Share-as-image in the app reads this to tell the post's card from the brand's.
    'Access-Control-Expose-Headers': 'X-DeHub-Share-Card',
  } });
}

function renderPng(svg, font) {
  const renderer = new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: 'Exo' } });
  let rendered;
  try { rendered = renderer.render(); return rendered.asPng(); }
  finally { rendered?.free(); renderer.free(); }
}

export async function handlePostShareImage(request, env, ctx, tokenId, fetchRecord, publicLookups) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  try {
    // Fetch anonymously before consulting the image cache: edits, counts and
    // restrictions must all be checked against the current record.
    const record = await fetchRecord(tokenId);
    if (!record) return brandCard(request, env, headers, 'unavailable');
    // Mature, restricted and unsupported posts share the brand card, never a
    // 404: a crawler that cached this URL earlier still gets an image.
    const base = postCardData(record);
    if (!base || base.tokenId !== tokenId) return brandCard(request, env, headers, 'restricted');
    const data = await loadPostShareDetails(base, publicLookups);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ revision: RENDER_REVISION, data })));
    const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    const key = new Request(`https://dehub.io/_og/post/${POST_CARD_VERSION}/${tokenId}.png?data=${fingerprint}`);
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const publicCache = `public, max-age=60, s-maxage=${POST_CARD_TTL}`;
    const cached = data.detailsComplete ? await cache?.match(key) : null;
    if (cached) {
      const hit = new Response(request.method === 'HEAD' ? null : cached.body, cached);
      hit.headers.set('Cache-Control', publicCache);
      return hit;
    }
    initialized ??= initWasm(wasm).catch((error) => { initialized = undefined; throw error; });
    const [, [font, mark, chrome], avatar, media, badges] = await Promise.all([
      initialized, loadAssets(env), loadAvatar(data.avatar), loadPostMedia(data.media),
      Promise.all(data.badges.map(async badge => {
        if (badge.kind === 'new') return badge;
        if (badge.kind === 'streamer') return { ...badge, uri: bytesToUri(new TextEncoder().encode(streamerShareSvg(badge)), 'image/svg+xml') };
        const response = await env.ASSETS.fetch(new Request(`https://dehub.io/brand/share-badges/${badge.slug}.png`));
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('Profile badge artwork unavailable');
        return { ...badge, uri: bytesToUri(new Uint8Array(await response.arrayBuffer()), 'image/png') };
      })),
    ]);
    // A picture that will not load leaves the post's words, or the brand card
    // when it has none; neither is cached, so the next fetch tries again.
    const mediaMissing = !!data.media && !media;
    if (mediaMissing && !data.title && !data.body) return brandCard(request, env, headers, 'media');
    const cacheable = data.detailsComplete && !mediaMissing;
    const svg = renderPostCardSvg(data, { logo: bytesToUri(mark, 'image/png'), chrome: bytesToUri(chrome, 'image/png'), avatar, badges, media });
    const png = renderPng(svg, font);
    const response = new Response(png, { headers: {
      ...headers, 'Content-Type': 'image/png', 'Cache-Control': cacheable ? publicCache : 'no-store',
      'ETag': `"${POST_CARD_VERSION}-${fingerprint}"`, 'X-DeHub-Share-Card': POST_CARD_VERSION,
      'X-DeHub-Post-Counts': `${data.likes},${data.comments},${data.views}`,
      'X-DeHub-Post-Media': media ? data.media.video ? 'video' : 'image' : mediaMissing ? 'unavailable' : 'none',
      'X-DeHub-Post-Avatar': avatar ? 'image' : 'initials',
      'X-DeHub-Post-Badges': data.badges.map(badge => badge.name).join(','),
      'X-DeHub-Post-Poll': data.poll ? data.poll.ended ? 'closed' : 'open' : 'none',
      'X-DeHub-Poll-Votes': data.poll?.ended ? String(data.poll.totalVotes) : '',
      'X-DeHub-Share-Artwork': 'integrated-chrome-edge',
    } });
    // The key is the render's own fingerprint, so the stored copy never goes
    // stale: any change to the post or its author is a different key.
    if (cache && cacheable) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set('Cache-Control', 'public, max-age=604800, immutable');
      ctx.waitUntil(cache.put(key, stored).catch(() => {}));
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    console.error('[Post share image]', error);
    try { return await brandCard(request, env, headers, 'error'); }
    catch { return new Response('Share image temporarily unavailable', { status: 503, headers: { ...headers, 'Retry-After': '30' } }); }
  }
}

/** A profile's card: avatar, name, handle and follower count, rechecked against the account on every fetch. */
export async function handleProfileShareImage(request, env, ctx, handle, fetchAccount) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  try {
    const data = profileCardData(await fetchAccount(handle));
    if (!data || data.handle.toLowerCase() !== handle.toLowerCase()) return brandCard(request, env, headers, 'unavailable');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ revision: RENDER_REVISION, data })));
    const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    const key = new Request(`https://dehub.io/_og/profile/${PROFILE_CARD_VERSION}/${encodeURIComponent(data.handle)}.png?data=${fingerprint}`);
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const publicCache = `public, max-age=60, s-maxage=${POST_CARD_TTL}`;
    const cached = await cache?.match(key);
    if (cached) {
      const hit = new Response(request.method === 'HEAD' ? null : cached.body, cached);
      hit.headers.set('Cache-Control', publicCache);
      return hit;
    }
    initialized ??= initWasm(wasm).catch((error) => { initialized = undefined; throw error; });
    const [, [font, mark, chrome], avatar] = await Promise.all([initialized, loadAssets(env), loadAvatar(data.avatar)]);
    const png = renderPng(renderProfileCardSvg(data, { logo: bytesToUri(mark, 'image/png'), chrome: bytesToUri(chrome, 'image/png'), avatar }), font);
    const cacheable = !data.avatar || !!avatar;
    const response = new Response(png, { headers: {
      ...headers, 'Content-Type': 'image/png', 'Cache-Control': cacheable ? publicCache : 'no-store',
      'ETag': `"${PROFILE_CARD_VERSION}-${fingerprint}"`, 'X-DeHub-Share-Card': `profile-${PROFILE_CARD_VERSION}`,
      'X-DeHub-Profile-Followers': data.followers === null ? '' : String(data.followers),
      'X-DeHub-Post-Avatar': avatar ? 'image' : 'initials',
    } });
    if (cache && cacheable) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set('Cache-Control', 'public, max-age=604800, immutable');
      ctx.waitUntil(cache.put(key, stored).catch(() => {}));
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    console.error('[Profile share image]', error);
    try { return await brandCard(request, env, headers, 'error'); }
    catch { return new Response('Share image temporarily unavailable', { status: 503, headers: { ...headers, 'Retry-After': '30' } }); }
  }
}
