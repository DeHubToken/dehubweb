import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCreatorMotionSource } from '../../server/creator-motion-source.js';
const id = '1'.repeat(20);
const source = 'https://jeanphilai.com/media/tpl/the-steps.mp4';
const env = { ASSETS: { fetch: vi.fn(async () => new Response(JSON.stringify({ [id]: source }), { headers: { 'Content-Type': 'application/json' } })) } };
afterEach(() => vi.restoreAllMocks());

describe('registered Creator source downloads', () => {
  it('streams a registered original across the hosted studio boundary without forwarding credentials', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
    const response = await handleCreatorMotionSource(new Request(`https://dehub.io/api/creator-motion-source?id=${id}`, {
      headers: { Origin: 'https://live.dehub.io', Authorization: 'private', Cookie: 'private' },
    }), env);
    expect(response.status).toBe(200); expect(await response.text()).toBe('video');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://live.dehub.io');
    expect(upstream.mock.calls[0][0]).toBe(source);
    expect(upstream.mock.calls[0][1]?.headers).toEqual({});
    expect(upstream.mock.calls[0][1]?.redirect).toBe('error');
  });
  it('rejects unregistered IDs and never fetches a URL supplied in the query', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await handleCreatorMotionSource(new Request(`https://dehub.io/api/creator-motion-source?id=${'2'.repeat(20)}&url=http://127.0.0.1`), env);
    expect(response.status).toBe(404); expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps oversized sources out of the upload flow and permits only a single range', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('video', { headers: { 'Content-Length': String(101 * 1024 * 1024) } }));
    expect((await handleCreatorMotionSource(new Request(`https://dehub.io/api/creator-motion-source?id=${id}`), env)).status).toBe(413);
    expect((await handleCreatorMotionSource(new Request(`https://dehub.io/api/creator-motion-source?id=${id}`, { headers: { Range: 'bytes=0-1,3-4' } }), env)).status).toBe(400);
  });
});
