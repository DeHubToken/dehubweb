/**
 * Byte ranges for video and audio files served from static assets.
 *
 * Workers static assets answer every request with the whole file (200), even
 * when the browser asks for a part of it. Safari on iPhone, iPad and Mac will
 * not play a <video> from a server that does that: it asks for `bytes=0-1`,
 * gets the whole file back, and gives up, so the clip never starts and only
 * the poster (or an empty tile) shows. Chrome and Firefox cope, which is why
 * this only ever looked broken for some people.
 *
 * This reads the file from assets and answers with the part asked for (206),
 * the way any ordinary web server does.
 */

const MEDIA_PATH = /\.(mp4|m4v|mov|webm|m4a|mp3|aac|ogg|wav)$/i;

/** Files above this are passed through whole rather than read into memory. */
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

/** Login clips never change under the same name: cache them for a week. */
const LONG_CACHE = /^\/login-stack\//;

export function isMediaPath(pathname) {
  return MEDIA_PATH.test(pathname);
}

/**
 * Turns one `Range` header into a start/end pair for a file of `size` bytes.
 * Returns null for no range (or one we do not serve, such as several ranges),
 * and 'unsatisfiable' for a range that starts past the end of the file.
 */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from, to] = match;
  if (from === '' && to === '') return null;
  if (from === '') {
    // Suffix range: the last N bytes.
    const length = Number(to);
    if (length === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}

/** Serves a media file from assets with range support. */
export async function serveMediaWithRanges(request, env, pathname) {
  const range = request.headers.get('Range');
  // Ask assets for the whole file: it ignores Range anyway, and a conditional
  // header would turn the answer into a body-less 304 we cannot slice.
  const assetRequest = new Request(request.url, { method: 'GET' });
  const asset = await env.ASSETS.fetch(assetRequest);
  if (asset.status !== 200) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  if (LONG_CACHE.test(pathname)) headers.set('Cache-Control', 'public, max-age=604800');

  const declared = Number(asset.headers.get('Content-Length'));
  const tooBig = Number.isFinite(declared) && declared > MAX_BUFFERED_BYTES;
  if (request.method === 'HEAD' || !range || tooBig) {
    return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers });
  }

  const body = await asset.arrayBuffer();
  const size = body.byteLength;
  const part = parseRange(range, size);
  if (part === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`);
    headers.delete('Content-Length');
    return new Response(null, { status: 416, headers });
  }
  if (!part) {
    headers.set('Content-Length', String(size));
    return new Response(body, { status: 200, headers });
  }
  headers.set('Content-Range', `bytes ${part.start}-${part.end}/${size}`);
  headers.set('Content-Length', String(part.end - part.start + 1));
  return new Response(body.slice(part.start, part.end + 1), { status: 206, headers });
}
