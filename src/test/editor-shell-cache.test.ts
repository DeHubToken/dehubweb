// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const browser = 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36';
const shell = '<!doctype html><html><head><script type="module" src="/assets/current-shell.js"></script></head><body><div id="root"></div></body></html>';
const serve = (path: string, body = shell, type = 'text/html', cache = 'public, max-age=0, must-revalidate') => {
  const fetch = vi.fn(async () => new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': cache } }));
  return { fetch, response: worker.fetch(new Request(`https://dehub.io${path}`, { headers: { 'User-Agent': browser } }), { ASSETS: { fetch } }, {}) as Promise<Response> };
};

describe('fresh editor shell after a deployment', () => {
  it.each(['/editor', '/editor?editor-check=current', '/', '/maldoteth', '/settings'])('prevents browser and CDN reuse of the SPA shell at %s', async path => {
    const { fetch, response } = serve(path), result = await response;
    expect(result.status).toBe(200);
    expect(await result.text()).toContain('/assets/current-shell.js');
    for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) expect(result.headers.get(header)).toBe('no-store');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains immutable caching for hashed scripts', async () => {
    const result = await serve('/assets/current-shell.js', 'export default {}', 'text/javascript', 'public, max-age=31536000, immutable').response;
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(result.headers.get('CDN-Cache-Control')).toBeNull();
    expect(await result.text()).toBe('export default {}');
  });
  it('keeps a missing old chunk a non-cacheable 404', async () => {
    const result = await serve('/assets/removed-editor.js').response;
    expect(result.status).toBe(404);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.text()).not.toContain('current-shell.js');
  });
  it('retains the separate cached editor information page for crawlers', async () => {
    const fetch = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    const result = await worker.fetch(new Request('https://dehub.io/editor', { headers: { 'User-Agent': 'Googlebot/2.1' } }), { ASSETS: { fetch } }, {}) as Response;
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toContain('s-maxage=3600');
    expect(result.headers.get('CDN-Cache-Control')).toBeNull();
    expect(await result.text()).not.toContain('/assets/current-shell.js');
  });
});
