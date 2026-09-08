import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVideoOutsideFeed } from '../lib/video-background-playback';

afterEach(() => vi.restoreAllMocks());

describe('background video playback', () => {
  it('keeps playback when the browser is minimized', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    expect(isVideoOutsideFeed(document.createElement('video'))).toBe(true);
  });

  it('protects only the video in picture in picture', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const video = document.createElement('video');
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => video });
    expect(isVideoOutsideFeed(video)).toBe(true);
    expect(isVideoOutsideFeed(document.createElement('video'))).toBe(false);
    expect(isVideoOutsideFeed(null)).toBe(false);
    delete (document as any).pictureInPictureElement;
  });

  it('allows ordinary scroll-away pausing in the foreground', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    expect(isVideoOutsideFeed(document.createElement('video'))).toBe(false);
  });
});
