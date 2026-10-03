import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSyncedAudio } from '@/hooks/use-synced-audio';
import { getHandoffAudio } from '@/lib/audio-handoff';

const key = 'synced:test-post:https://example.com/sound.mp3';
function Surface({ video }: { video: HTMLVideoElement }) {
  const ref = useRef(video);
  useSyncedAudio({ mediaKey: 'test-post', soundtrackUrl: 'https://example.com/sound.mp3', isPlaying: true, isMuted: false, volume: 0.7, videoRef: ref });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps the same soundtrack and playback choices while the video changes surfaces', () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  video.currentTime = 12;
  video.playbackRate = 1.5;
  const view = render(<><Surface video={video} /><span /></>);
  const audio = getHandoffAudio(key)!.el;
  expect(audio.currentTime).toBe(12);
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.volume).toBe(0.7);
  expect(audio.paused).toBe(false);
  const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
  view.rerender(<><Surface video={video} /><Surface video={video} /></>);
  expect(getHandoffAudio(key)!.el).toBe(audio);
  expect(audio.paused).toBe(false);
  view.rerender(<><Surface video={video} /><span /></>);
  expect(getHandoffAudio(key)!.el).toBe(audio);
  expect(audio.currentTime).toBe(12);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(plays);
});
