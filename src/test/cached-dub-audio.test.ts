import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCachedDubAudio } from '@/hooks/use-cached-dub-audio';
import { setVolume } from '@/lib/video-preferences';
import { DEFAULT_DUB_MIX, setDubMix } from '@/lib/dub-mix';

class TestAudio extends EventTarget {
  readyState = 4;
  currentTime = 0;
  volume = 1;
  muted = false;
  playbackRate = 1;
  paused = true;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  removeAttribute = vi.fn();
  load = vi.fn();
}
let audio: TestAudio;
beforeEach(() => {
  setVolume(0.8);
  setDubMix(DEFAULT_DUB_MIX);
  audio = new TestAudio();
  vi.stubGlobal('Audio', class { constructor() { return audio; } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { value: false, writable: true });
  const ref = { current: video };
  const failed = vi.fn();
  const hook = renderHook(() => useCachedDubAudio(ref, 'https://example.test/voice.m4a', failed));
  return { video, failed, ...hook };
}
it('plays a separate voice track and keeps original gain steady through silent gaps and pauses', () => {
  const { video, unmount } = setup();
  expect(audio.volume).toBe(0.8);
  expect(video.volume).toBeCloseTo(0.008);
  act(() => { video.currentTime = 8; video.dispatchEvent(new Event('timeupdate')); });
  expect(audio.currentTime).toBe(8);
  expect(video.volume).toBeCloseTo(0.008);
  act(() => { Object.defineProperty(video, 'paused', { value: true }); video.dispatchEvent(new Event('pause')); });
  expect(audio.paused).toBe(true);
  expect(video.volume).toBeCloseTo(0.008);
  unmount();
  expect(video.volume).toBe(0.8);
});
it('updates the two gains independently and follows rate and mute changes', () => {
  const { video } = setup();
  act(() => setDubMix({ voice: 0.5, original: 0.3 }));
  expect(audio.volume).toBeCloseTo(0.2);
  expect(video.volume).toBeCloseTo(0.072);
  act(() => { video.playbackRate = 1.5; video.muted = true; video.dispatchEvent(new Event('ratechange')); });
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.muted).toBe(true);
  expect(audio.paused).toBe(true);
});
it('restores the original when the cached track fails', () => {
  const { video, failed } = setup();
  act(() => audio.dispatchEvent(new Event('error')));
  expect(failed).toHaveBeenCalledTimes(1);
  expect(video.volume).toBe(0.8);
  expect(audio.paused).toBe(true);
});
