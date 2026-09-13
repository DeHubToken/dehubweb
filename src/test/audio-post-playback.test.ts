import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/media-session', () => ({
  claimMediaSession: vi.fn(),
  releaseMediaSession: vi.fn(),
  setMediaSessionPlaying: vi.fn(),
  setMediaSessionPosition: vi.fn(),
}));

import { claimMediaSession, releaseMediaSession } from '@/lib/media-session';
import {
  getAudioPostPlaybackState,
  popOutAudioPost,
  seekAudioPost,
  stopAudioPost,
  takeBackAudioPost,
  toggleAudioPost,
} from '@/lib/audio-post-playback';

/** An <audio> jsdom can drive: play/pause flip `paused` and fire their events. */
function fakeElement({ duration = 100, currentTime = 25 } = {}) {
  const el = document.createElement('audio');
  let paused = true;
  let time = currentTime;
  Object.defineProperty(el, 'duration', { value: duration, configurable: true, writable: true });
  Object.defineProperty(el, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  Object.defineProperty(el, 'paused', { configurable: true, get: () => paused });
  const play = vi.spyOn(el, 'play').mockImplementation(() => {
    paused = false;
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const pause = vi.spyOn(el, 'pause').mockImplementation(() => {
    paused = true;
    el.dispatchEvent(new Event('pause'));
  });
  return { el, play, pause };
}

const track = {
  tokenId: '42',
  audioUrl: 'https://cdn.example/42.mp3',
  title: 'Late night',
  artist: 'nick',
};

describe('lib/audio-post-playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    stopAudioPost();
  });

  it('adopts the card element as-is and starts it under its own media session', () => {
    const { el, play } = fakeElement();
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });

    expect(play).toHaveBeenCalledOnce();
    expect(claimMediaSession).toHaveBeenCalledWith(
      'audio-post-popout',
      expect.objectContaining({ title: 'Late night', artist: 'nick' }),
      expect.objectContaining({ play: expect.any(Function), stop: expect.any(Function) }),
    );
    const state = getAudioPostPlaybackState();
    expect(state.tokenId).toBe('42');
    expect(state.isPlaying).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.duration).toBe(100);
    expect(state.progress).toBeCloseTo(0.25);
  });

  it('follows the element and holds a seek until metadata lands', () => {
    const { el } = fakeElement({ duration: NaN, currentTime: 0 });
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });
    expect(getAudioPostPlaybackState().isLoading).toBe(true);

    seekAudioPost(0.5);
    expect(getAudioPostPlaybackState().progress).toBe(0.5);
    expect(el.currentTime).toBe(0);

    Object.defineProperty(el, 'duration', { value: 200, configurable: true });
    el.dispatchEvent(new Event('loadedmetadata'));
    expect(el.currentTime).toBe(100);
    expect(getAudioPostPlaybackState().isLoading).toBe(false);

    el.currentTime = 150;
    el.dispatchEvent(new Event('timeupdate'));
    expect(getAudioPostPlaybackState().progress).toBeCloseTo(0.75);
  });

  it('pauses and resumes in place, keeping the panel', () => {
    const { el, play, pause } = fakeElement();
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });

    toggleAudioPost();
    expect(pause).toHaveBeenCalledOnce();
    expect(getAudioPostPlaybackState().isPlaying).toBe(false);
    expect(getAudioPostPlaybackState().tokenId).toBe('42');

    toggleAudioPost();
    expect(play).toHaveBeenCalledTimes(2);
    expect(getAudioPostPlaybackState().isPlaying).toBe(true);
  });

  it('rests at the end of the track instead of closing', () => {
    const { el } = fakeElement();
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });
    el.dispatchEvent(new Event('ended'));

    const state = getAudioPostPlaybackState();
    expect(state.tokenId).toBe('42');
    expect(state.isPlaying).toBe(false);
    expect(state.progress).toBe(1);
  });

  it('hands the same element back and lets go of it completely', () => {
    const { el, pause } = fakeElement();
    const graph = { el, source: null, analyser: null };
    popOutAudioPost({ track, graph });

    const returned = takeBackAudioPost('42');
    expect(returned).toBe(graph);
    expect(pause).not.toHaveBeenCalled();
    expect(el.getAttribute('src')).not.toBeNull;
    expect(releaseMediaSession).toHaveBeenCalledWith('audio-post-popout');
    expect(getAudioPostPlaybackState().tokenId).toBeNull();

    // Detached: the element's events no longer reach the engine.
    el.currentTime = 90;
    el.dispatchEvent(new Event('timeupdate'));
    expect(getAudioPostPlaybackState().progress).toBe(0);
  });

  it('refuses to hand back a post it does not hold', () => {
    const { el } = fakeElement();
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });
    expect(takeBackAudioPost('7')).toBeNull();
    expect(getAudioPostPlaybackState().tokenId).toBe('42');
  });

  it('stops, drops the source and releases the session on close', () => {
    const { el, pause } = fakeElement();
    el.src = track.audioUrl;
    popOutAudioPost({ track, graph: { el, source: null, analyser: null } });

    stopAudioPost();
    expect(pause).toHaveBeenCalledOnce();
    expect(el.getAttribute('src')).toBeNull();
    expect(releaseMediaSession).toHaveBeenCalledWith('audio-post-popout');
    expect(getAudioPostPlaybackState().tokenId).toBeNull();
  });

  it('replaces a previous pop-out rather than queueing behind it', () => {
    const first = fakeElement();
    popOutAudioPost({ track, graph: { el: first.el, source: null, analyser: null } });
    const second = fakeElement();
    popOutAudioPost({
      track: { ...track, tokenId: '43' },
      graph: { el: second.el, source: null, analyser: null },
    });

    expect(first.pause).toHaveBeenCalledOnce();
    expect(second.play).toHaveBeenCalledOnce();
    expect(getAudioPostPlaybackState().tokenId).toBe('43');
  });
});
