import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hlsVod = vi.hoisted(() => ({
  setVideoSource: vi.fn(),
  syncVideoLoad: vi.fn(),
  clearVideoSource: vi.fn(),
}));
vi.mock('@/lib/hls-vod', () => hlsVod);
vi.mock('@/lib/visual-activity', () => ({
  useFeedPlaybackAllowed: () => true,
  visualActivity: { isFeedPlaybackAllowed: () => true },
}));
vi.mock('@/components/app/video/VideoGlitchLoaderLazy', () => ({ VideoGlitchLoader: () => null }));

import { AutoplayVideo } from '@/components/app/AutoplayVideo';

const MP4 = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/6888.mp4';
const LADDER = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/6888/hls/lq3k9x/master.m3u8';

let observers: IntersectionObserverCallback[] = [];
beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observers.push(callback); }
    observe() {} unobserve() {} disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.values(hlsVod).forEach(fn => fn.mockClear());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function visibility(visible: boolean) {
  const entry = { isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry;
  act(() => observers.forEach(intersect => intersect([entry], {} as IntersectionObserver)));
}

describe('autoplay grid tiles', () => {
  it('play the ladder from the lowest rung once on screen, with the MP4 as fallback', () => {
    const { container } = render(<AutoplayVideo src={MP4} hlsSrc={LADDER} />);
    const video = container.querySelector('video')!;
    expect(hlsVod.setVideoSource).not.toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();

    visibility(true);
    expect(hlsVod.setVideoSource).toHaveBeenCalledWith(video, { src: MP4, hls: LADDER, startLow: true });
    expect(hlsVod.syncVideoLoad).toHaveBeenCalledWith(video);
    expect(video.getAttribute('preload')).toBe('metadata');
  });

  it('detach the session when they leave the screen and when they unmount', () => {
    const { container, unmount } = render(<AutoplayVideo src={MP4} hlsSrc={LADDER} />);
    const video = container.querySelector('video')!;
    visibility(true);
    visibility(false);
    expect(hlsVod.clearVideoSource).toHaveBeenCalledWith(video);

    hlsVod.clearVideoSource.mockClear();
    visibility(true);
    unmount();
    expect(hlsVod.clearVideoSource).toHaveBeenCalledWith(video);
  });

  it('play the MP4 when the post has no ladder', () => {
    const { container } = render(<AutoplayVideo src={MP4} />);
    visibility(true);
    expect(hlsVod.setVideoSource).toHaveBeenCalledWith(container.querySelector('video'), { src: MP4, hls: undefined, startLow: true });
  });

  it('hold the poster until the tile comes near the screen, then keep it', () => {
    const poster = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/6888.jpg';
    const { container } = render(<AutoplayVideo src={MP4} poster={poster} />);
    const video = container.querySelector('video')!;
    expect(video.getAttribute('poster')).toBeNull();

    visibility(true);
    expect(video.getAttribute('poster')).toContain('6888.jpg');
    visibility(false);
    expect(video.getAttribute('poster')).toContain('6888.jpg');
  });
});
