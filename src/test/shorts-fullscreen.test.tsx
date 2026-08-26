import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVideoFullscreen } from '@/hooks/use-video-fullscreen';

/**
 * The shorts viewer shipped with no way to go fullscreen at all — 46 controls on
 * the page and not one of them fullscreen, while the feed's VideoCard had a
 * button all along. Reported as "I cant see anyway to full screen a video from
 * this spot", and confirmed live before this was written.
 *
 * Rendered with react-dom directly rather than @testing-library/react: this repo
 * only needs the hook's return value, and the extra dependency buys nothing.
 */
// React only treats act() as supported when this is set, and warns on every
// render otherwise. Vitest does not set it for us.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T>(useIt: () => T) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const result = { current: undefined as T };
  function Probe() {
    result.current = useIt();
    return null;
  }
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Probe));
  });
  return { result, unmount: () => act(() => root.unmount()) };
}

function refs(container: HTMLElement, video?: HTMLVideoElement) {
  return {
    videoRef: { current: video ?? null },
    containerRef: { current: container as HTMLElement | null },
  };
}

function setNativeFullscreen(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
}

afterEach(() => {
  setNativeFullscreen(null);
  vi.restoreAllMocks();
});

describe('useVideoFullscreen', () => {
  it('requests fullscreen on the container, not the bare video', () => {
    // The container carries the seek strip and the play indicator; fullscreening
    // the <video> alone would leave every control behind.
    const container = document.createElement('div');
    const request = vi.fn(() => Promise.resolve());
    (container as any).requestFullscreen = request;
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('exits when already natively fullscreen', () => {
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const exit = vi.fn();
    (document as any).exitFullscreen = exit;
    setNativeFullscreen(container);
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(exit).toHaveBeenCalledTimes(1);
    expect((container as any).requestFullscreen).not.toHaveBeenCalled();
  });

  it('prefers webkitEnterFullscreen on iOS, where element fullscreen does not exist', () => {
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const video = document.createElement('video');
    (video as any).webkitEnterFullscreen = vi.fn();
    const { videoRef, containerRef } = refs(container, video);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect((video as any).webkitEnterFullscreen).toHaveBeenCalledTimes(1);
    expect((container as any).requestFullscreen).not.toHaveBeenCalled();
  });

  it('falls back to simulated fullscreen when a WebView resolves but does nothing', async () => {
    // SafePal's WebView exposes requestFullscreen, resolves it, and never enters
    // fullscreen. Only the delayed re-check catches that.
    vi.useFakeTimers();
    const container = document.createElement('div');
    (container as any).requestFullscreen = vi.fn(() => Promise.resolve());
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isFullscreen).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to simulated fullscreen when the API is absent entirely', () => {
    const container = document.createElement('div');
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());

    expect(result.current.isFullscreen).toBe(true);
  });

  it('leaves simulated fullscreen without calling exitFullscreen', () => {
    // There is no native state to exit, and calling exitFullscreen here throws
    // in some browsers.
    const container = document.createElement('div');
    const exit = vi.fn();
    (document as any).exitFullscreen = exit;
    const { videoRef, containerRef } = refs(container);

    const { result } = renderHook(() => useVideoFullscreen(videoRef, containerRef));
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('the two players share one fullscreen implementation', () => {
  const SLIDE = readFileSync(
    resolve(__dirname, '../components/app/cards/VideoSlide.tsx'),
    'utf8',
  );
  const CARD = readFileSync(
    resolve(__dirname, '../components/app/cards/VideoCard.tsx'),
    'utf8',
  );

  it('gives the shorts viewer a fullscreen control at all', () => {
    // The whole point of the change: this file had no fullscreen anything.
    expect(SLIDE).toMatch(/aria-label=\{isFullscreen \? 'Exit fullscreen' : 'Enter fullscreen'\}/);
  });

  it('routes both players through the shared hook', () => {
    // The iOS and WebView fallbacks are subtle enough that a second copy would
    // drift. Neither file should re-implement the raw API.
    expect(SLIDE).toContain('useVideoFullscreen(videoRef, frameRef)');
    expect(CARD).toContain('useVideoFullscreen(videoRef, containerRef)');
    expect(CARD).not.toContain('webkitEnterFullscreen');
  });

  it('charges the double-tap delay only to the centre band', () => {
    // Tap-to-pause is the viewer's primary gesture. Waiting 300ms on every tap
    // to see whether a second one is coming would make the whole player feel
    // laggy, so only the centre — the only place a double-tap does anything —
    // pays it.
    expect(SLIDE).toMatch(/if \(!inCentre\) \{\s*onTap\?\.\(\);\s*return;\s*\}/);
  });
});
