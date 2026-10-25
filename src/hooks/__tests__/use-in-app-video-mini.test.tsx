import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PanInfo } from 'framer-motion';
import { bodyScrollLockDepth, lockBodyScroll } from '@/lib/body-scroll-lock';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { useInAppVideoMini } from '../use-in-app-video-mini';

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ''; });
const pan = (x: number, y: number, dy = 0, dx = 0, velocity = 0): PanInfo => ({
  point: { x: x + dx, y: y + dy }, offset: { x: dx, y: dy },
  delta: { x: dx, y: dy }, velocity: { x: 0, y: velocity },
});
function mount(width = 1920, height = 1080, enabled = true) {
  let controls!: ReturnType<typeof useInAppVideoMini>;
  function Viewer() {
    const root = useRef<HTMLDivElement>(null);
    const mini = useInAppVideoMini(root, 0, enabled);
    controls = mini;
    return <div ref={root} data-testid="viewer" data-mini={mini.minimized} style={mini.frame}>
      <div data-shorts-slide="0"><video src="https://example.test/playing.mp4" /></div>
      <button onClick={mini.restore}>Restore</button>
    </div>;
  }
  const view = render(<Viewer />);
  const video = view.container.querySelector('video')!;
  Object.defineProperties(video, { videoWidth: { value: width }, videoHeight: { value: height } });
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 800 } as DOMRect);
  video.currentTime = 42;
  const event = { target: video } as unknown as Event;
  return { ...view, video, get mini() { return controls; },
    start(x: number, y: number, target: Element = video) { act(() => controls.start({ target } as unknown as Event, pan(x, y))); },
    end(x: number, y: number, dy: number, dx = 0, velocity = 0) { let consumed = false; act(() => { consumed = controls.finish(pan(x, y, dy, dx, velocity)); }); return consumed; }, event };
}

it.each([[1920, 1080], [1080, 1080], [1080, 1920]])('minimizes and restores the same %sx%s video without changing media state', async (w, h) => {
  const view = mount(w, h);
  const load = vi.spyOn(view.video, 'load');
  const play = vi.spyOn(view.video, 'play');
  const pause = vi.spyOn(view.video, 'pause');
  expect(bodyScrollLockDepth()).toBe(1);
  view.start(200, 400);
  act(() => { expect(view.mini.drag(pan(200, 400, 120))).toBe(true); });
  expect(view.mini.dragging).toBe(true);
  await waitFor(() => {
    expect(view.mini.backdropOpacity.get()).toBeCloseTo(0.25);
    expect(view.mini.chromeOpacity.get()).toBe(0);
  });
  expect(view.end(200, 400, 120)).toBe(true);
  expect(view.mini.minimized).toBe(true);
  expect(view.mini.frame!.width / view.mini.frame!.height).toBeCloseTo(w / h);
  expect(bodyScrollLockDepth()).toBe(0);
  expect(document.body.classList.contains('shorts-viewer-open')).toBe(false);
  expect(view.container.querySelector('video')).toBe(view.video);
  expect(view.video.currentTime).toBe(42);
  fireEvent.click(screen.getByText('Restore'));
  expect(view.mini.minimized).toBe(false);
  expect(bodyScrollLockDepth()).toBe(1);
  expect(view.container.querySelector('video')).toBe(view.video);
  expect(view.video.currentTime).toBe(42);
  expect(load).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
  expect(pause).not.toHaveBeenCalled();
  view.unmount();
  expect(bodyScrollLockDepth()).toBe(0);
});

it('ignores letterbox, controls, horizontal swipes and disabled fullscreen/comments contexts', () => {
  const view = mount();
  view.start(200, 30); // Above the contained wide picture.
  expect(view.end(200, 30, 200)).toBe(false);
  view.start(200, 400, screen.getByText('Restore'));
  expect(view.end(200, 400, 200)).toBe(false);
  view.start(200, 400);
  expect(view.end(200, 400, 100, 200)).toBe(false);
  expect(view.mini.minimized).toBe(false);
  view.unmount();
  const disabled = mount(1920, 1080, false);
  disabled.start(200, 400);
  expect(disabled.end(200, 400, 200)).toBe(false);
});

it('cancels a short or reversed drag and keeps another overlay scroll lock intact', () => {
  document.body.style.overflow = 'auto';
  const releaseOther = lockBodyScroll('another-overlay');
  const view = mount();
  view.start(200, 400);
  expect(view.end(200, 400, 30)).toBe(true);
  expect(view.mini.minimized).toBe(false);
  view.start(200, 400);
  act(() => { view.mini.drag(pan(200, 400, 120)); view.mini.drag(pan(200, 400, -10)); });
  expect(view.mini.scale.get()).toBe(1);
  expect(view.mini.y.get()).toBe(0);
  expect(view.mini.backdropOpacity.get()).toBe(1);
  view.start(200, 400);
  act(() => view.mini.cancel());
  expect(view.end(200, 400, 150)).toBe(false);
  view.start(200, 400);
  expect(view.end(200, 400, -150)).toBe(false);
  view.start(200, 400);
  view.end(200, 400, 150);
  expect(bodyScrollLockDepth()).toBe(1);
  expect(document.body.style.overflow).toBe('hidden');
  view.unmount();
  releaseOther();
  expect(bodyScrollLockDepth()).toBe(0);
  expect(document.body.style.overflow).toBe('auto');
});

it('keeps audio ownership while feed autoplay starts behind the mini', () => {
  const muteFeed = vi.fn();
  videoPlaybackManager.register('background-feed', vi.fn(), muteFeed, () => true);
  videoPlaybackManager.play('background-feed');
  videoPlaybackManager.claimAudio('background-feed');
  const view = mount();
  const owner = videoPlaybackManager.getCurrentlyPlayingId();
  expect(owner).not.toBe('background-feed');
  expect(muteFeed).toHaveBeenCalledWith(true);
  view.start(200, 400);
  view.end(200, 400, 150);
  expect(videoPlaybackManager.play('background-feed')).toBe(false);
  expect(videoPlaybackManager.takeFreeAudio('background-feed')).toBe(false);
  expect(videoPlaybackManager.getCurrentlyPlayingId()).toBe(owner);
  fireEvent.click(screen.getByText('Restore'));
  expect(videoPlaybackManager.getCurrentlyPlayingId()).toBe(owner);
  view.unmount();
  expect(videoPlaybackManager.getCurrentlyPlayingId()).toBe('background-feed');
  videoPlaybackManager.unregister('background-feed');
});
