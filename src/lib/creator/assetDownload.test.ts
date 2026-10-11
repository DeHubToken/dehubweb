import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetToFile } from './assetDownload';

afterEach(() => vi.unstubAllGlobals());
const mockResponse = (response: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

describe('bounded generated asset transfers', () => {
  it('preserves the actual format and bytes when content length is absent', async () => {
    mockResponse(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } }));
    const file = await assetToFile('https://media.example/voice.mp3', 'voice.mp3', 'audio/mpeg');
    expect(file.type).toBe('audio/wav'); expect(file.size).toBe(3);
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([1, 2, 3]);
  });
  it('rejects an oversized header without reading the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel });
    mockResponse(new Response(body, { headers: { 'Content-Length': '999' } }));
    await expect(assetToFile('https://media.example/clip', 'clip.mp4', 'video/mp4', { maxBytes: 3 })).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('stops chunked or misleadingly sized responses as soon as they cross the limit', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); }, cancel });
    mockResponse(new Response(body, { headers: { 'Content-Length': '1' } }));
    await expect(assetToFile('https://media.example/clip', 'clip.mp4', 'video/mp4', { maxBytes: 3 })).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels a stalled stream and forwards abort to the network request', async () => {
    const cancel = vi.fn(); const controller = new AbortController();
    mockResponse(new Response(new ReadableStream({ cancel })));
    const pending = assetToFile('https://media.example/clip', 'clip.mp4', 'video/mp4', { signal: controller.signal });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce()); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledWith('https://media.example/clip', { signal: controller.signal });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('does not fetch when already cancelled and rejects failed HTTP responses', async () => {
    const controller = new AbortController(); controller.abort(); vi.stubGlobal('fetch', vi.fn());
    await expect(assetToFile('https://media.example/clip', 'clip.mp4', 'video/mp4', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled(); mockResponse(new Response('denied', { status: 403 }));
    await expect(assetToFile('https://media.example/clip', 'clip.mp4', 'video/mp4')).rejects.toThrow('(403)');
  });
});
