import { describe, it, expect, afterEach, vi } from 'vitest';

// The self-hosted ingest forwards Opus, which Safari cannot play in HLS at any
// layer. Browsers whose Media Source takes Opus keep the original ladder; the
// rest are handed the server's on-demand AAC copy. The verdict is cached per
// page load, so each case loads the module fresh.
async function loadWith(opusInMse: boolean | null) {
  vi.resetModules();
  vi.stubEnv('VITE_MEDIAMTX_HOST', 'live.dehub.io');
  const g = globalThis as any;
  if (opusInMse === null) delete g.MediaSource;
  else g.MediaSource = { isTypeSupported: (type: string) => opusInMse && type.includes('opus') };
  return import('@/lib/live-ingest');
}

const host = 'live.dehub.io';
const selfHosted = { provider: 'mediamtx', playbackId: 'abc123' };

describe('self-hosted HLS on browsers that cannot play Opus', () => {
  const original = (globalThis as any).MediaSource;
  afterEach(() => {
    (globalThis as any).MediaSource = original;
  });

  it('keeps the original ladder where Media Source plays Opus', async () => {
    const m = await loadWith(true);
    expect(m.hlsUrlFor(selfHosted)).toBe(`https://${host}/abc123/index.m3u8`);
  });

  it('hands Safari-like browsers the AAC copy', async () => {
    const m = await loadWith(false);
    expect(m.hlsUrlFor(selfHosted)).toBe(`https://${host}/abc123-aac/index.m3u8`);
  });

  it('hands browsers with no Media Source at all the AAC copy', async () => {
    const m = await loadWith(null);
    expect(m.hlsUrlFor(selfHosted)).toBe(`https://${host}/abc123-aac/index.m3u8`);
  });

  it('never sends a Livepeer stream to the AAC copy', async () => {
    const m = await loadWith(false);
    expect(m.hlsUrlFor({ playbackId: 'abc123' })).toBe(
      'https://livepeercdn.studio/hls/abc123/index.m3u8',
    );
  });

  it('resolves the AAC copy back to the original playbackId for WebRTC', async () => {
    const m = await loadWith(false);
    expect(m.liveSourceFromHlsUrl(`https://${host}/abc123-aac/index.m3u8`)).toEqual({
      provider: 'mediamtx',
      playbackId: 'abc123',
    });
    expect(m.isAacCopyUrl(`https://${host}/abc123-aac/index.m3u8`)).toBe(true);
    expect(m.isAacCopyUrl(`https://${host}/abc123/index.m3u8`)).toBe(false);
  });
});

describe('big-event broadcasts', () => {
  it('are recognised by URL once a mapper has noted the stream', async () => {
    const m = await loadWith(true);
    const url = m.hlsUrlFor(selfHosted);
    expect(m.isBigEventPlayback(url)).toBe(false);
    m.noteLatencyMode({ ...selfHosted, settings: { latencyMode: 'event' } });
    expect(m.isBigEventPlayback(url)).toBe(true);
    // The AAC copy is the same broadcast.
    expect(m.isBigEventPlayback(`https://${host}/abc123-aac/index.m3u8`)).toBe(true);
  });

  it('stop being one when the stream says otherwise', async () => {
    const m = await loadWith(true);
    m.noteLatencyMode({ ...selfHosted, settings: { latencyMode: 'event' } });
    m.noteLatencyMode({ ...selfHosted, settings: { latencyMode: 'normal' } });
    expect(m.isBigEventPlayback(m.hlsUrlFor(selfHosted))).toBe(false);
  });

  it('sync about ten segments behind live with low-latency parts off', async () => {
    const m = await loadWith(true);
    expect(m.BIG_EVENT_HLS_CONFIG).toMatchObject({ lowLatencyMode: false, liveSyncDurationCount: 10 });
  });
});
