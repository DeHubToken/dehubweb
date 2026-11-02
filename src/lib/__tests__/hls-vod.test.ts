import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({ logToBackend: vi.fn() }));

/** Stand-in for hls.js: records what the module asks of it. */
const instances: FakeHls[] = [];
let mseSupported = true;
class FakeHls {
  static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' };
  static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };
  static isSupported = () => mseSupported;
  config: Record<string, any>;
  handlers = new Map<string, (event: string, data?: any) => void>();
  source?: string;
  media?: HTMLVideoElement;
  startLoad = vi.fn();
  stopLoad = vi.fn();
  destroy = vi.fn();
  recoverMediaError = vi.fn();
  constructor(config: Record<string, any>) {
    this.config = { ...config };
    instances.push(this);
  }
  on(event: string, handler: (event: string, data?: any) => void) { this.handlers.set(event, handler); }
  loadSource(url: string) { this.source = url; }
  attachMedia(el: HTMLVideoElement) { this.media = el; }
  emit(event: string, data?: any) { this.handlers.get(event)?.(event, data); }
}
vi.mock('hls.js', () => ({ default: FakeHls }));

import {
  clearVideoSource,
  isLadderPlayback,
  reloadVideoSource,
  setVideoSource,
  syncVideoLoad,
  videoSourceOf,
} from '../hls-vod';

const MP4 = 'https://cdn.test/videos/42.mp4';
let ladderCount = 0;
/** A fresh ladder per test: retired ladders stay retired for the module's life. */
const freshLadder = () => `https://cdn.test/videos/42/hls/r${++ladderCount}/master.m3u8`;
/** Let the dynamic hls.js import settle. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function video({ nativeHls = false } = {}) {
  const el = document.createElement('video');
  el.load = vi.fn();
  el.play = vi.fn().mockResolvedValue(undefined);
  el.pause = vi.fn();
  el.canPlayType = vi.fn((type: string) => (nativeHls && type === 'application/vnd.apple.mpegurl' ? 'maybe' : '')) as any;
  return el;
}

const setVendor = (vendor: string) => Object.defineProperty(navigator, 'vendor', { value: vendor, configurable: true });

describe('hls-vod', () => {
  // Resolve the mocked module once, so every later dynamic import is a cache hit.
  beforeAll(async () => {
    await import('hls.js');
  });
  beforeEach(() => {
    instances.length = 0;
    mseSupported = true;
    setVendor('Google Inc.');
  });
  afterEach(() => setVendor(''));

  it('plays the MP4 untouched when a post has no ladder', () => {
    const el = video();
    setVideoSource(el, { src: MP4 });
    expect(el.getAttribute('src')).toBe(MP4);
    expect(videoSourceOf(el)).toBe(MP4);
    expect(isLadderPlayback(el)).toBe(false);
  });

  it('plays the ladder through hls.js, starting a feed card on the lowest rung', async () => {
    const el = video();
    const ladder = freshLadder();
    setVideoSource(el, { src: MP4, hls: ladder, startLow: true });
    // Asking "does this element have its media?" answers the post, not the blob: URL.
    expect(videoSourceOf(el)).toBe(MP4);
    await flush();
    const [player] = instances;
    expect(player.source).toBe(ladder);
    expect(player.media).toBe(el);
    expect(player.config).toMatchObject({ startLevel: 0, capLevelToPlayerSize: true, autoStartLoad: false });
    expect(isLadderPlayback(el)).toBe(true);
  });

  it('starts the post page wherever the connection allows', async () => {
    const el = video();
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    expect(instances[0].config.startLevel).toBe(-1);
  });

  it('keeps to the preload rules: nothing for none, one segment for metadata, a buffer once playing', async () => {
    const el = video();
    el.preload = 'none';
    setVideoSource(el, { src: MP4, hls: freshLadder(), startLow: true });
    await flush();
    const [player] = instances;
    player.emit(FakeHls.Events.MANIFEST_PARSED);
    expect(player.startLoad).not.toHaveBeenCalled();

    el.preload = 'metadata';
    syncVideoLoad(el);
    expect(player.startLoad).toHaveBeenCalledTimes(1);
    expect(player.config.maxBufferLength).toBe(4);
    // A ceiling, not just a target: hls.js would otherwise read ahead by bytes.
    expect(player.config.maxMaxBufferLength).toBe(4);

    Object.defineProperty(el, 'paused', { value: false, configurable: true });
    el.dispatchEvent(new Event('play'));
    expect(player.config.maxBufferLength).toBe(30);
    expect(player.config.maxMaxBufferLength).toBe(30);
    expect(player.startLoad).toHaveBeenCalledTimes(1);
  });

  it('never restarts the download when the same post is asked for again', async () => {
    const el = video();
    const ladder = freshLadder();
    setVideoSource(el, { src: MP4, hls: ladder, startLow: true });
    await flush();
    // The post page adopting the feed card's element, with or without the ladder on its copy.
    setVideoSource(el, { src: MP4, hls: ladder });
    setVideoSource(el, { src: MP4 });
    await flush();
    expect(instances).toHaveLength(1);
    expect(instances[0].destroy).not.toHaveBeenCalled();
  });

  it('falls back to the MP4 on a fatal ladder error, at the same position, and retires the ladder', async () => {
    const el = video();
    const ladder = freshLadder();
    setVideoSource(el, { src: MP4, hls: ladder });
    await flush();
    const [player] = instances;
    Object.defineProperty(el, 'paused', { value: false, configurable: true });
    Object.defineProperty(el, 'currentTime', { value: 12, writable: true, configurable: true });
    player.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.NETWORK_ERROR, details: 'fragLoadError' });

    expect(player.destroy).toHaveBeenCalled();
    expect(el.getAttribute('src')).toBe(MP4);
    expect(el.currentTime).toBe(12);
    expect(el.play).toHaveBeenCalled();

    // Another card for the same post goes straight to the MP4.
    const other = video();
    setVideoSource(other, { src: MP4, hls: ladder });
    expect(other.getAttribute('src')).toBe(MP4);
  });

  describe('a ladder the wrong shape for its post', () => {
    /** A poster image of the given size, decoded at once. */
    function stubPoster(width: number, height: number) {
      vi.stubGlobal('Image', class {
        src = '';
        naturalWidth = width;
        naturalHeight = height;
        decode() { return Promise.resolve(); }
      });
    }
    function withFrame(el: HTMLVideoElement, width: number, height: number) {
      Object.defineProperty(el, 'videoWidth', { value: width, configurable: true });
      Object.defineProperty(el, 'videoHeight', { value: height, configurable: true });
      el.poster = 'https://cdn.test/images/42.jpg';
    }
    afterEach(() => vi.unstubAllGlobals());

    it('plays the MP4 when an upright phone video was squeezed into a landscape ladder', async () => {
      stubPoster(540, 960);
      const el = video();
      setVideoSource(el, { src: MP4, hls: freshLadder() });
      await flush();
      withFrame(el, 854, 480);
      el.dispatchEvent(new Event('loadedmetadata'));
      await flush();
      expect(instances[0].destroy).toHaveBeenCalled();
      expect(el.getAttribute('src')).toBe(MP4);
    });

    it('keeps a ladder whose picture matches the poster', async () => {
      stubPoster(1280, 720);
      const el = video();
      setVideoSource(el, { src: MP4, hls: freshLadder() });
      await flush();
      withFrame(el, 854, 480);
      el.dispatchEvent(new Event('loadedmetadata'));
      await flush();
      expect(instances[0].destroy).not.toHaveBeenCalled();
      expect(isLadderPlayback(el)).toBe(true);
    });
  });

  it('gives a decoder error one recovery before giving up on the ladder', async () => {
    const el = video();
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    const [player] = instances;
    const mediaError = { fatal: true, type: FakeHls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError' };
    player.emit(FakeHls.Events.ERROR, mediaError);
    expect(player.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(player.destroy).not.toHaveBeenCalled();
    player.emit(FakeHls.Events.ERROR, mediaError);
    expect(player.destroy).toHaveBeenCalled();
    expect(el.getAttribute('src')).toBe(MP4);
  });

  it('ignores errors hls.js recovers from on its own', async () => {
    const el = video();
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    instances[0].emit(FakeHls.Events.ERROR, { fatal: false, type: FakeHls.ErrorTypes.NETWORK_ERROR, details: 'fragLoadError' });
    expect(instances[0].destroy).not.toHaveBeenCalled();
  });

  it('plays HLS natively on Safari and swallows its error before the card sees a broken post', () => {
    setVendor('Apple Computer, Inc.');
    const el = video({ nativeHls: true });
    const cardSawError = vi.fn();
    el.addEventListener('error', cardSawError);
    const ladder = freshLadder();
    setVideoSource(el, { src: MP4, hls: ladder });
    expect(el.getAttribute('src')).toBe(ladder);
    expect(instances).toHaveLength(0);

    el.dispatchEvent(new Event('error'));
    expect(cardSawError).not.toHaveBeenCalled();
    expect(el.getAttribute('src')).toBe(MP4);

    // Once on the MP4, errors are the card's again.
    el.dispatchEvent(new Event('error'));
    expect(cardSawError).toHaveBeenCalledTimes(1);
  });

  it('plays the MP4 where neither MSE nor native HLS exists', async () => {
    mseSupported = false;
    const el = video();
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    expect(instances).toHaveLength(0);
    expect(el.getAttribute('src')).toBe(MP4);
  });

  it('does not switch a clip that is already playing its MP4 when a ladder turns up', () => {
    const el = video();
    setVideoSource(el, { src: MP4 });
    Object.defineProperty(el, 'paused', { value: false, configurable: true });
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    expect(el.getAttribute('src')).toBe(MP4);
  });

  it('releases hls.js with the element', async () => {
    const el = video();
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    clearVideoSource(el);
    expect(instances[0].destroy).toHaveBeenCalled();
    expect(el.load).toHaveBeenCalled();
    expect(videoSourceOf(el)).toBeNull();
  });

  it('leaves a ladder alone while its master playlist is still loading', async () => {
    const el = video();
    el.preload = 'auto';
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    const [player] = instances;
    // A stall check fires before the manifest arrives (the first short opening).
    reloadVideoSource(el);
    expect(player.stopLoad).not.toHaveBeenCalled();
    player.emit(FakeHls.Events.MANIFEST_PARSED);
    expect(player.startLoad).toHaveBeenCalledTimes(1);
  });

  it('reloads a ladder through hls.js, never load(), which would detach its MediaSource', async () => {
    const el = video();
    el.preload = 'metadata';
    setVideoSource(el, { src: MP4, hls: freshLadder() });
    await flush();
    const [player] = instances;
    player.emit(FakeHls.Events.MANIFEST_PARSED);
    reloadVideoSource(el);
    expect(el.load).not.toHaveBeenCalled();
    expect(player.stopLoad).toHaveBeenCalled();
    expect(player.startLoad).toHaveBeenCalledTimes(2);

    const plain = video();
    setVideoSource(plain, { src: MP4 });
    reloadVideoSource(plain);
    expect(plain.load).toHaveBeenCalled();
  });
});
