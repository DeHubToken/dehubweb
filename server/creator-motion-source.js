const HOSTS = new Set(['d2ol7oe51mr4n9.cloudfront.net', 'cdn.higgsfield.ai', 'd8j0ntlcm91z4.cloudfront.net', 'static.higgsfield.ai', 'jeanphilai.com', 'media.pixverse.ai']);
const ORIGINS = new Set(['https://dehub.io', 'https://live.dehub.io']);
const MAX_BYTES = 100 * 1024 * 1024;

export async function handleCreatorMotionSource(request, env) {
  const url = new URL(request.url), id = url.searchParams.get('id');
  const headers = new Headers({ 'Cache-Control': 'public, max-age=3600', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  const origin = request.headers.get('Origin');
  if (ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  const fail = (status, message) => { const errorHeaders = new Headers(headers); errorHeaders.set('Cache-Control', 'no-store'); return new Response(message, { status, headers: errorHeaders }); };
  if (!/^[a-f0-9]{20}$/.test(id || '')) return fail(400, 'Choose a registered source clip.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Use GET or HEAD.');
  const range = request.headers.get('Range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return fail(400, 'Use a single byte range.');
  let stage = 'catalog';
  try {
    const index = await env.ASSETS.fetch(new Request(new URL(`/creator-clips/sources/${id.slice(0, 2)}.json`, request.url), { headers: { Accept: 'application/json' } }));
    if (!index.ok || !index.headers.get('Content-Type')?.includes('application/json')) return fail(404, 'Source clip unavailable.');
    const sources = await index.json(), source = sources[id];
    if (typeof source !== 'string') return fail(404, 'Source clip unavailable.');
    const media = new URL(source);
    if (media.protocol !== 'https:' || media.username || media.password || media.port || !HOSTS.has(media.hostname)) return fail(404, 'Source clip unavailable.');
    stage = 'upstream';
    const upstream = await fetch(media.href, { method: request.method, headers: range ? { Range: range } : {},
      redirect: 'error', signal: AbortSignal.timeout(30000), cf: { cacheEverything: true, cacheTtl: 3600 } });
    if (!upstream.ok) { headers.set('X-Source-Status', String(upstream.status)); await upstream.body?.cancel(); return fail(upstream.status === 404 ? 404 : 502, 'Source clip unavailable.'); }
    stage = 'stream';
    const declared = upstream.headers.get('Content-Range')?.split('/')[1] ?? upstream.headers.get('Content-Length');
    const bytes = declared === null ? null : Number(declared);
    if (bytes !== null && (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES)) { await upstream.body?.cancel(); return fail(413, 'Choose a source clip under 100 MB.'); }
    for (const key of ['Content-Length', 'Content-Range', 'Accept-Ranges']) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    headers.set('Content-Type', 'video/mp4');
    let received = 0;
    const body = request.method === 'HEAD' ? null : upstream.body?.pipeThrough(new TransformStream({ transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_BYTES) controller.error(new Error('Source clip exceeds 100 MB.'));
      else controller.enqueue(chunk);
    } }));
    return new Response(body, { status: upstream.status, headers });
  } catch (error) {
    headers.set('X-Source-Stage', stage);
    headers.set('X-Source-Error', error instanceof Error ? error.name : 'Error');
    return fail(502, 'Source clip unavailable.');
  }
}
