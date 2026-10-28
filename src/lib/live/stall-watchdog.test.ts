import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchLiveProgress } from './stall-watchdog';

function fakeVideo() {
  return { currentTime: 0, paused: false, getVideoPlaybackQuality: () => ({ totalVideoFrames: 0 }) } as unknown as HTMLVideoElement & { currentTime: number; paused: boolean };
}

describe('watchLiveProgress', () => {
  afterEach(() => vi.useRealTimers());

  it('reports a frozen picture and counts repeats', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 6000, onStall });
    vi.advanceTimersByTime(6000);
    expect(onStall).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(6000);
    expect(onStall).toHaveBeenLastCalledWith(2);
    stop();
  });

  it('stays quiet while the clock moves or the video is paused', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 4000, onStall });
    for (let i = 0; i < 5; i++) { video.currentTime += 2; vi.advanceTimersByTime(2000); }
    video.paused = true;
    vi.advanceTimersByTime(20000);
    expect(onStall).not.toHaveBeenCalled();
    stop();
  });
});
