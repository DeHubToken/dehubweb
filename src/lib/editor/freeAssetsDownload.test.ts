import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFreeAsset, type FreeAsset } from './freeAssets';

const asset: FreeAsset = { id: 'audio', source: 'Openverse', kind: 'audio', title: 'Quiet morning', creator: 'Creator', thumbnailUrl: '', downloadUrl: 'https://media.example/track.mp3', landingUrl: 'https://media.example/credits', mimeType: 'audio/mpeg', license: 'CC0', attributionRequired: false, attributionText: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const respond = (response: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

describe('stock media downloads', () => {
  it.each([['audio/x-wav; charset=binary', 'audio/wav', 'wav'], ['audio/mp4', 'audio/mp4', 'm4a'], ['audio/x-flac', 'audio/flac', 'flac'], ['application/ogg; codecs=vorbis', 'audio/ogg', 'ogg']])('imports the actual %s codec and its matching extension', async (reported, mime, extension) => {
    respond(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': reported } }));
    const file = await downloadFreeAsset(asset);
    expect(file.name).toBe(`quiet-morning.${extension}`); expect(file.type).toBe(mime); expect(file.size).toBe(3);
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(file); });
    expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3]);
  });
  it('uses catalogue format for a generic binary response', async () => {
    respond(new Response('audio', { headers: { 'Content-Type': 'application/octet-stream' } }));
    const file = await downloadFreeAsset(asset); expect(file.name).toBe('quiet-morning.mp3'); expect(file.type).toBe('audio/mpeg');
  });
  it('imports Wikimedia audio whose catalogue and response use the generic Ogg type', async () => {
    respond(new Response('OggS', { headers: { 'Content-Type': 'application/octet-stream' } }));
    const file = await downloadFreeAsset({ ...asset, source: 'Wikimedia Commons', mimeType: 'application/ogg', downloadUrl: 'https://media.example/track.ogg' });
    expect(file.name).toBe('quiet-morning.ogg'); expect(file.type).toBe('audio/ogg');
  });
  it('keeps generic Ogg responses out of the photo catalogue', async () => {
    const cancel = vi.fn(); respond(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/ogg' } }));
    await expect(downloadFreeAsset({ ...asset, kind: 'photo', mimeType: 'image/jpeg' })).rejects.toThrow('unsupported media format');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['text/html', 'video/mp4'])('rejects %s returned instead of an audio asset before reading it', async type => {
    const cancel = vi.fn(); respond(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': type } }));
    await expect(downloadFreeAsset(asset)).rejects.toThrow('unsupported media format'); expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects empty and oversized stock without buffering an oversized body', async () => {
    respond(new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }));
    await expect(downloadFreeAsset(asset)).rejects.toThrow('empty file');
    const cancel = vi.fn(); respond(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(501 * 1024 * 1024) } }));
    await expect(downloadFreeAsset(asset)).rejects.toThrow('too large'); expect(cancel).toHaveBeenCalledOnce();
  });
  it('stops a stalled stock download when the creator cancels', async () => {
    const cancel = vi.fn(), controller = new AbortController();
    respond(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'audio/mpeg' } }));
    const pending = downloadFreeAsset(asset, controller.signal); await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce()); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(cancel).toHaveBeenCalledOnce();
  });
  it('retains the existing proxy fallback when a provider blocks direct downloads', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://backend.example');
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('blocked')).mockResolvedValueOnce(new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } })); vi.stubGlobal('fetch', fetcher);
    const file = await downloadFreeAsset(asset); expect(file.type).toBe('audio/mpeg');
    expect(String(fetcher.mock.calls[1][0])).toContain('/functions/v1/free-stock-assets?download=');
  });
});
