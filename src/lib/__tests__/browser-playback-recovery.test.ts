import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { attachPlaybackRecovery } from '../browser-playback-recovery';
import { requestVideoPlayback, cancelVideoPlayback } from '../video-start';
vi.mock('../logger', () => ({ logToBackend: vi.fn() }));

describe('browser media recovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  function setup() {
    const video = document.createElement('video');
    video.src = 'https://cdn.test/42.mp4';
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();
    video.load = vi.fn();
    const allowed = vi.fn(() => true);
    const changed = vi.fn();
    const detach = attachPlaybackRecovery(video, { allowed, changed, postId: '42', component: 'TestVideo' });
    return { video, allowed, changed, detach };
  }
  it('retries a failed video once and exposes terminal failure', async () => {
    const { video, changed, detach } = setup();
    await requestVideoPlayback(video);
    video.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(video.load).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('error'));
    expect(changed).toHaveBeenLastCalledWith('failed');
    expect(video.pause).toHaveBeenCalledTimes(1);
    detach();
  });
  it('cancels a stuck play when its owner leaves', async () => {
    const { video, allowed, detach } = setup();
    await requestVideoPlayback(video);
    allowed.mockReturnValue(false);
    vi.advanceTimersByTime(30_000);
    expect(video.load).not.toHaveBeenCalled();
    detach();
  });
  it('does not resume a loading video after an explicit pause', async () => {
    const { video, detach } = setup();
    await requestVideoPlayback(video);
    cancelVideoPlayback(video);
    vi.advanceTimersByTime(30_000);
    expect(video.load).not.toHaveBeenCalled();
    expect(video.play).toHaveBeenCalledTimes(1);
    detach();
  });
  it('offers play on autoplay denial without reloading', async () => {
    const { video, changed, detach } = setup();
    video.play = vi.fn().mockRejectedValue({ name: 'NotAllowedError' });
    await requestVideoPlayback(video);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenLastCalledWith('blocked');
    expect(video.load).not.toHaveBeenCalled();
    detach();
  });

  it('pauses a late browser start after the user canceled it', async () => {
    const { video, detach } = setup();
    let finish!: () => void;
    video.play = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    await requestVideoPlayback(video);
    cancelVideoPlayback(video);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(video.pause).toHaveBeenCalledTimes(1);
    detach();
  });

  it('does not let an old play promise pause a new owner', async () => {
    const { video, detach } = setup();
    let finish!: () => void;
    video.play = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    await requestVideoPlayback(video);
    detach();
    const detachNext = attachPlaybackRecovery(video, { allowed: () => true, changed: vi.fn(), postId: '42', component: 'Post' });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(video.pause).not.toHaveBeenCalled();
    detachNext();
  });
});
