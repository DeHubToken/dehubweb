import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { STAGE_CARD_VERSION, renderStageCardSvg, stageCardAssetPaths, stageCardSource } from './stage-share-card.js';

const SHARE_IMAGE = 'https://dehub.io/og/dehub-social-share.png';
const FONTS = ['/brand-kit/font/exo-500.ttf', '/brand-kit/font/exo-700.ttf', '/brand-kit/font/mono.ttf'];
let initialized;
let fonts;

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const images = new Map();

/** A brand-kit picture as a data URI, cached per path; null when it can't be read. */
function loadImage(env, path) {
  if (!images.has(path)) images.set(path, (async () => {
    const response = await env.ASSETS.fetch(new Request(`https://dehub.io${path}`));
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) throw new Error(`Stage card image unavailable: ${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${TYPES[path.split('.').pop()] || 'application/octet-stream'};base64,${btoa(binary)}`;
  })().catch((error) => { images.delete(path); console.error('[Stage share image]', error); return null; }));
  return images.get(path);
}

async function loadImages(env, stage) {
  const paths = stageCardAssetPaths(stage);
  const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await loadImage(env, path)]));
  return Object.fromEntries(entries.filter(([, uri]) => uri));
}

function loadFonts(env) {
  if (!fonts) fonts = Promise.all(FONTS.map(async (path) => {
    const response = await env.ASSETS.fetch(new Request(`https://dehub.io${path}`));
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Stage card font unavailable');
    return new Uint8Array(await response.arrayBuffer());
  })).catch((error) => { fonts = undefined; throw error; });
  return fonts;
}

/**
 * /_og/stage/v2/<id>.png — the generated Chrome Mic banner for a stage with no cover.
 * Rendered from the live row, so a stage going live or ending changes its
 * card; cached under a fingerprint of the fields the card reads.
 */
export async function handleStageShareImage(request, env, ctx, id, lookup) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  const fallback = () => Response.redirect(SHARE_IMAGE, 302);
  try {
    const stage = await lookup(`audio_spaces?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    if (!stage) return fallback();
    const source = stageCardSource(stage);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(source)));
    const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const key = new Request(`https://dehub.io/_og/stage/${STAGE_CARD_VERSION}/${id}.png?data=${fingerprint}`);
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const publicCache = 'public, max-age=60, s-maxage=300';
    const cached = await cache?.match(key);
    if (cached) {
      const hit = new Response(request.method === 'HEAD' ? null : cached.body, cached);
      hit.headers.set('Cache-Control', publicCache);
      return hit;
    }
    initialized ??= initWasm(wasm).catch((error) => { initialized = undefined; throw error; });
    const [, fontBuffers, pictures] = await Promise.all([initialized, loadFonts(env), loadImages(env, stage)]);
    const renderer = new Resvg(renderStageCardSvg(stage, pictures), { font: { fontBuffers, defaultFontFamily: 'Exo' } });
    let png;
    try { const rendered = renderer.render(); png = rendered.asPng(); rendered.free(); }
    finally { renderer.free(); }
    const response = new Response(png, { headers: {
      ...headers, 'Content-Type': 'image/png', 'Cache-Control': publicCache,
      'ETag': `"${STAGE_CARD_VERSION}-${fingerprint}"`, 'X-DeHub-Share-Card': `stage-${STAGE_CARD_VERSION}`,
    } });
    if (cache) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set('Cache-Control', 'public, max-age=604800, immutable');
      ctx.waitUntil(cache.put(key, stored).catch(() => {}));
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    console.error('[Stage share image]', error);
    return fallback();
  }
}
