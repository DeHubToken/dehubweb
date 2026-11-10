/**
 * Safari only plays a <video> when the server answers byte-range requests
 * with 206. Static assets answer with the whole file, so the worker slices it.
 */
import { describe, expect, it } from 'vitest';
import { isMediaPath, parseRange, serveMediaWithRanges } from '../../server/media-range.js';

const FILE = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
const env = {
  ASSETS: {
    fetch: async (req: Request) => {
      // Like the real binding: ranges and conditionals are ignored.
      if (new URL(req.url).pathname.endsWith('missing.mp4')) return new Response('nope', { status: 404 });
      return new Response(FILE, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '100' } });
    },
  },
};
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  serveMediaWithRanges(new Request(`https://riftn.com${path}`, { method, headers }), env, path);

describe('media byte ranges', () => {
  it('only takes video and audio files', () => {
    expect(isMediaPath('/login-stack/1.mp4')).toBe(true);
    expect(isMediaPath('/sounds/a.MP3')).toBe(true);
    expect(isMediaPath('/login-stack/1.jpg')).toBe(false);
    expect(isMediaPath('/@mal')).toBe(false);
  });

  it('reads the range forms browsers send', () => {
    expect(parseRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
    expect(parseRange('bytes=50-', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange(null, 100)).toBeNull();
  });

  it("answers Safari's first probe with exactly two bytes", async () => {
    const res = await get('/login-stack/1.mp4', { Range: 'bytes=0-1' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/100');
    expect(res.headers.get('Content-Length')).toBe('2');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1]);
  });

  it('serves the whole file with Accept-Ranges when no range is asked', async () => {
    const res = await get('/login-stack/1.mp4');
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800');
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('says 416 past the end and passes a missing file through', async () => {
    expect((await get('/login-stack/1.mp4', { Range: 'bytes=200-' })).status).toBe(416);
    expect((await get('/login-stack/missing.mp4', { Range: 'bytes=0-1' })).status).toBe(404);
  });
});
