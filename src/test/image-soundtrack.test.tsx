import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useImageSoundtrack } from '@/hooks/use-image-soundtrack';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { handoffAudioFor } from '@/lib/audio-handoff';
import { pauseOffDocumentMediaIn } from '@/lib/pause-media-in';

let intersect: (entries: { isIntersecting: boolean }[]) => void;
let rejectPlay: ((reason: Error) => void) | undefined;
let pending = false;

function Player({ enabled = true, url = 'https://example.com/music.mp3', id = '42', label = '' }) {
  const anchor = useRef<HTMLDivElement>(null);
  const state = useImageSoundtrack(url, anchor, enabled, id);
  return <div ref={anchor}>
    <button onClick={state.toggle}>{label}{state.error ? 'retry' : state.loading ? 'loading' : state.playing ? 'pause' : 'play'}</button>
  </div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  pending = false;
  rejectPlay = undefined;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    const wasPaused = this.paused;
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    if (!wasPaused) this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    if (pending) return new Promise<void>((_, reject) => { rejectPlay = reject; });
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
});

afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const audio = (url = 'https://example.com/music.mp3') => handoffAudioFor(`soundtrack:42:${url}`)!;

it('loads only on tap, and never autoplays on entering the viewport', () => {
  const { container } = render(<Player />);
  act(() => intersect([{ isIntersecting: true }]));
  expect(audio().getAttribute('src')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('play'));
  expect(screen.getByText('pause')).toBeTruthy();
  expect(audio().src).toBe('https://example.com/music.mp3');
});

it('pauses out of view and does not restart when returning', () => {
  render(<Player />);
  fireEvent.click(screen.getByText('play'));
  act(() => intersect([{ isIntersecting: false }]));
  act(() => intersect([{ isIntersecting: true }]));
  expect(screen.getByText('play')).toBeTruthy();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
});

it('allows cancellation during load without showing a stale rejection as an error', async () => {
  pending = true;
  render(<Player />);
  fireEvent.click(screen.getByText('play'));
  fireEvent.click(screen.getByText('loading'));
  await act(async () => rejectPlay?.(new Error('aborted')));
  expect(screen.getByText('play')).toBeTruthy();
});

it('shows retry for a genuine playback failure', async () => {
  pending = true;
  render(<Player />);
  fireEvent.click(screen.getByText('play'));
  await act(async () => rejectPlay?.(new Error('offline')));
  expect(screen.getByText('retry')).toBeTruthy();
  pending = false;
  fireEvent.click(screen.getByText('retry'));
  expect(screen.getByText('pause')).toBeTruthy();
});

it('gates playback and pauses immediately when access is withdrawn', () => {
  const { rerender } = render(<Player enabled={false} />);
  fireEvent.click(screen.getByText('play'));
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  rerender(<Player />);
  fireEvent.click(screen.getByText('play'));
  rerender(<Player enabled={false} />);
  expect(screen.getByText('play')).toBeTruthy();
});

it('yields to another video claiming audio', () => {
  render(<Player />);
  fireEvent.click(screen.getByText('play'));
  act(() => videoPlaybackManager.claimAudio('other'));
  expect(screen.getByText('play')).toBeTruthy();
  videoPlaybackManager.stop('other');
});

it('resets on a changed soundtrack and preserves position on normal pause', () => {
  const { container, rerender } = render(<Player />);
  fireEvent.click(screen.getByText('play'));
  audio().currentTime = 12;
  fireEvent.click(screen.getByText('pause'));
  expect(audio().currentTime).toBe(12);
  rerender(<Player url="https://example.com/other.mp3" />);
  expect(audio('https://example.com/other.mp3').getAttribute('src')).toBeNull();
});

it('hands the same playing soundtrack to the post and back without reloading', () => {
  const view = render(<><Player /><span /></>);
  fireEvent.click(screen.getByText('play'));
  const track = audio();
  track.currentTime = 12;
  const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
  pauseOffDocumentMediaIn(view.container, '42');
  expect(track.paused).toBe(false);
  view.rerender(<><Player /><Player /></>);
  expect(audio()).toBe(track);
  expect(track.paused).toBe(false);
  expect(track.currentTime).toBe(12);
  view.rerender(<><Player /><span /></>);
  expect(audio()).toBe(track);
  expect(track.paused).toBe(false);
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads);
});

it('plays any post in a feed where several posts use the same song', () => {
  render(<><Player id="1" label="first " /><Player id="2" label="second " /></>);
  fireEvent.click(screen.getByText('first play'));
  expect(screen.getByText('first pause')).toBeTruthy();
  expect(screen.getByText('second play')).toBeTruthy();
});

it('plays the copy the user taps when the same post is on the page twice', () => {
  render(<><Player label="original " /><Player label="repost " /></>);
  fireEvent.click(screen.getByText('original play'));
  expect(screen.getByText('original pause')).toBeTruthy();
  fireEvent.click(screen.getByText('original pause'));
  fireEvent.click(screen.getByText('repost play'));
  expect(screen.getByText('repost pause')).toBeTruthy();
  expect(screen.getByText('original play')).toBeTruthy();
});
