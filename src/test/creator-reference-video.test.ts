import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedReferenceVideo, movieDuration, referenceVideoDuration } from '../../supabase/functions/_shared/creator-reference-video';
import { buildCreatorFalImageRequest, buildCreatorFalVideoRequest } from '../../supabase/functions/_shared/creator-fal-input';

function movie(seconds: number, version = 0) {
  const mdhd = new Uint8Array(version ? 32 : 24), view = new DataView(mdhd.buffer), scale = version ? 20 : 12;
  mdhd[0] = version; view.setUint32(scale, 2400);
  if (version) view.setBigUint64(scale + 4, BigInt(Math.round(seconds * 2400)));
  else view.setUint32(scale + 4, Math.round(seconds * 2400));
  const handler = new Uint8Array(12); handler.set([118, 105, 100, 101], 8);
  const timing = new Uint8Array(16), stts = new DataView(timing.buffer);
  stts.setUint32(4, 1); stts.setUint32(8, seconds * 24); stts.setUint32(12, 100);
  const sizes = new Uint8Array(12), stsz = new DataView(sizes.buffer); stsz.setUint32(4, 1); stsz.setUint32(8, seconds * 24);
  return box('moov', box('trak', box('mdia', box('mdhd', mdhd), box('hdlr', handler), box('minf', box('stbl', box('stts', timing), box('stsz', sizes))))));
}
function box(type: string, ...parts: Uint8Array[]) {
  const bytes = new Uint8Array(8 + parts.reduce((n, p) => n + p.length, 0)); new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set([...type].map(c => c.charCodeAt(0)), 4); let offset = 8;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes;
}
function clip(seconds: number, tail = false) {
  const metadata = movie(seconds), media = box('mdat', new Uint8Array(tail ? 600000 : seconds * 24));
  return new Uint8Array([...box('ftyp', new Uint8Array(8)), ...(tail ? [...media, ...metadata] : [...metadata, ...media])]);
}
function fetchClip(bytes: Uint8Array) {
  return vi.fn(async (_url: string, options: { headers: { Range: string }; redirect?: string }) => {
    const [start, requestedEnd] = options.headers.Range.replace('bytes=', '').split('-').map(Number), end = Math.min(requestedEnd, bytes.length - 1);
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } });
  });
}
afterEach(() => vi.unstubAllGlobals());
describe('reference clips before payment', () => {
  it('reads both movie header versions and rejects broken metadata', () => {
    expect(movieDuration(movie(8.25))).toBe(8.25);
    expect(movieDuration(movie(29.5, 1))).toBe(29.5);
    expect(movieDuration(new Uint8Array(108))).toBeNull();
    const broken = movie(10); new DataView(broken.buffer).setUint32(44, 0);
    expect(movieDuration(broken)).toBeNull();
    expect(movieDuration(box('mdat', movie(10)))).toBeNull();
    const forged = box('moov', box('mvhd', new Uint8Array(108)));
    expect(movieDuration(forged)).toBeNull();
  });
  it('reads metadata from the end of a clip and bills its actual rounded duration', async () => {
    const fetch = fetchClip(clip(8.25, true));
    vi.stubGlobal('fetch', fetch);
    expect(await referenceVideoDuration('https://storage.test/clip.mp4', 15, 'storage.test')).toBe(9);
    expect(fetch.mock.calls[1][1].headers.Range).toBe('bytes=600024-1124311');
  });
  it('refuses clips beyond the provider length and size limits', async () => {
    vi.stubGlobal('fetch', fetchClip(clip(16)));
    await expect(referenceVideoDuration('https://storage.test/clip.mp4', 15, 'storage.test')).rejects.toThrow('between 3 and 15');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(movie(5), { status: 206, headers: { 'Content-Range': 'bytes 0-107/209715201' } })));
    await expect(referenceVideoDuration('https://storage.test/clip.mp4', 15, 'storage.test')).rejects.toThrow('under 200 MB');
  });
  it('only fetches known media hosts and never follows redirects', async () => {
    for (const url of ['http://storage.test/video.mp4', 'https://localhost/video.mp4', 'https://storage.test.evil/video.mp4', 'https://user@storage.test/video.mp4']) expect(allowedReferenceVideo(url, 'storage.test')).toBe(false);
    expect(allowedReferenceVideo('https://v3.fal.media/files/clip.mp4', 'storage.test')).toBe(true);
    const fetch = fetchClip(clip(5));
    vi.stubGlobal('fetch', fetch);
    await expect(referenceVideoDuration('https://evil.test/clip.mp4', 15, 'storage.test')).rejects.toThrow('Upload');
    expect(fetch).not.toHaveBeenCalled();
    await referenceVideoDuration('https://storage.test/clip.mp4', 15, 'storage.test');
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });
});
describe('reference workflow input limits', () => {
  const input = { prompt: 'Replace the person in @Video1 with @Image1.', sourceImage: 'https://media.test/character.png', videoUrls: ['https://media.test/clip.mp4'] };
  it('does not submit incomplete or incompatible swaps', () => {
    expect(() => buildCreatorFalVideoRequest('kling-o3-edit', { ...input, videoUrls: [] })).toThrow();
    expect(() => buildCreatorFalVideoRequest('kling-o3-edit', { ...input, sourceImage: undefined })).toThrow();
    expect(() => buildCreatorFalVideoRequest('kling-3-motion', { ...input, referenceImageUrls: ['other.png'] })).toThrow();
    expect(() => buildCreatorFalVideoRequest('kling-o3-edit', { ...input, seed: 42 })).toThrow();
    expect(buildCreatorFalVideoRequest('kling-o3-edit', { ...input, referenceImageUrls: [input.sourceImage, 'outfit.png'] }).input.image_urls).toEqual([input.sourceImage, 'outfit.png']);
  });
  it('keeps every image in a composition and rejects models that accept one', () => {
    const request = buildCreatorFalImageRequest('flux-3-image', 'Combine these assets.', 'subject.png', '1:1', ['subject.png', 'background.png']);
    expect(request.input.image_urls).toEqual(['subject.png', 'background.png']);
    expect(() => buildCreatorFalImageRequest('flux-3-image', 'Combine', undefined, '1:1', ['1', '2', '3', '4', '5'])).toThrow();
    expect(() => buildCreatorFalImageRequest('hidream-i1-full', 'Combine', '1', '1:1', ['2'])).toThrow();
  });
});
