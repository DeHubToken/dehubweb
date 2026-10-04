import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimHandoffVideo, releaseHandoffVideo, handoffVideoFor } from '../lib/video-handoff';
import { isVideoInPictureInPicture, releaseAfterPictureInPicture } from '../lib/picture-in-picture';
import { pauseMediaIn } from '../lib/pause-media-in';

let pip: HTMLVideoElement | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => pip });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  pip = null;
  document.querySelectorAll('video').forEach(video => video.dispatchEvent(new Event('leavepictureinpicture')));
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as any).pictureInPictureElement;
  document.body.innerHTML = '';
});

describe('picture-in-picture navigation', () => {
  it('releases ordinary videos immediately when their source page is removed', () => {
    const release = vi.fn();
    releaseAfterPictureInPicture(document.createElement('video'), release);
    expect(release).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-pip-parking]')).toBeNull();
  });
  it('keeps the same video connected past the normal navigation grace, then disposes on close', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const { el, token } = claimHandoffVideo('pip-navigation', slot);
    el.src = 'https://example.com/clip.mp4';
    pip = el;
    releaseHandoffVideo('pip-navigation', token);
    slot.remove();
    vi.advanceTimersByTime(10000);
    expect(el.isConnected).toBe(true);
    expect(handoffVideoFor('pip-navigation')).toBe(el);
    expect(el.pause).not.toHaveBeenCalled();
    expect(el.getAttribute('src')).toBe('https://example.com/clip.mp4');
    pip = null;
    el.dispatchEvent(new Event('leavepictureinpicture'));
    expect(handoffVideoFor('pip-navigation')).toBeNull();
    expect(el.pause).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-pip-parking]')).toBeNull();
  });

  it('does not dispose a PiP video reclaimed by its post before the window closes', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const { el, token } = claimHandoffVideo('pip-reclaim', first);
    pip = el;
    releaseHandoffVideo('pip-reclaim', token);
    const next = claimHandoffVideo('pip-reclaim', second);
    pip = null;
    el.dispatchEvent(new Event('leavepictureinpicture'));
    expect(second.firstChild).toBe(el);
    expect(el.pause).not.toHaveBeenCalled();
    releaseHandoffVideo('pip-reclaim', next.token);
    vi.advanceTimersByTime(2000);
    expect(handoffVideoFor('pip-reclaim')).toBeNull();
  });

  it('defers HLS/WebRTC cleanup when React removes a source page', () => {
    const video = document.createElement('video');
    pip = video;
    const release = vi.fn(() => video.remove());
    releaseAfterPictureInPicture(video, release);
    expect(video.isConnected).toBe(true);
    expect(release).not.toHaveBeenCalled();
    pip = null;
    video.dispatchEvent(new Event('leavepictureinpicture'));
    video.dispatchEvent(new Event('leavepictureinpicture'));
    expect(release).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-pip-parking]')).toBeNull();
  });

  it('recognizes Safari PiP and spares it when its page is hidden', () => {
    const root = document.createElement('div');
    const video = document.createElement('video');
    root.append(video);
    document.body.append(root);
    Object.defineProperty(video, 'webkitPresentationMode', { configurable: true, value: 'picture-in-picture' });
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    expect(isVideoInPictureInPicture(video)).toBe(true);
    expect(pauseMediaIn(root)).toEqual([]);
    expect(video.pause).not.toHaveBeenCalled();
  });
});
