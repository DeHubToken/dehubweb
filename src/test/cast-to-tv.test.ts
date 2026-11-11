import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  delete (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent;
  delete (window as unknown as Record<string, unknown>).chrome;
});

describe('castToTv', () => {
  it('explains instead of failing where the browser has no way to cast', async () => {
    const { castToTv, canCastToTv } = await import('@/lib/castToTv');
    expect(canCastToTv()).toBe('remote' in HTMLMediaElement.prototype);
    if (!('remote' in HTMLMediaElement.prototype)) {
      expect(await castToTv({ url: 'https://cdn.dehub.io/videos/1.mp4' })).toBe('unsupported');
    }
  });

  it('opens the AirPlay picker on the page player when it plays a real URL', async () => {
    (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent = function () {};
    const { castToTv } = await import('@/lib/castToTv');
    const page = document.createElement('video') as HTMLVideoElement & { webkitShowPlaybackTargetPicker: () => void };
    Object.defineProperty(page, 'currentSrc', { value: 'https://cdn.dehub.io/videos/1.m3u8' });
    page.disableRemotePlayback = true;
    page.webkitShowPlaybackTargetPicker = vi.fn();
    expect(await castToTv({ url: 'https://cdn.dehub.io/videos/1.mp4', pageVideo: page })).toBe('picker');
    expect(page.webkitShowPlaybackTargetPicker).toHaveBeenCalledOnce();
    expect(page.disableRemotePlayback).toBe(false);
  });

  it('hands a hls.js (blob:) player to a separate element that plays the file', async () => {
    (window as unknown as Record<string, unknown>).WebKitPlaybackTargetAvailabilityEvent = function () {};
    const picker = vi.fn();
    (HTMLMediaElement.prototype as unknown as Record<string, unknown>).webkitShowPlaybackTargetPicker = picker;
    const { castToTv } = await import('@/lib/castToTv');
    const page = document.createElement('video');
    Object.defineProperty(page, 'currentSrc', { value: 'blob:https://riftn.com/abc' });
    expect(await castToTv({ url: 'https://cdn.dehub.io/videos/1.mp4', pageVideo: page })).toBe('picker');
    const castEl = picker.mock.contexts[0] as HTMLVideoElement;
    expect(castEl).not.toBe(page);
    expect(castEl.src).toBe('https://cdn.dehub.io/videos/1.mp4');
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).webkitShowPlaybackTargetPicker;
  });
});
