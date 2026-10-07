import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceDub } from '@/hooks/use-voice-dub';
import { setVolume } from '@/lib/video-preferences';
import { DEFAULT_DUB_MIX, setDubMix, applyVideoVolume } from '@/lib/dub-mix';

const speech = vi.hoisted(() => ({ speak: vi.fn(), cancel: vi.fn() }));
vi.mock('@/hooks/dub-preference', () => ({ synth: () => speech }));

const segments = [{ start: 0, end: 3, text: 'Hola' }, { start: 4, end: 7, text: 'Adiós' }];
const voice = { lang: 'es-ES' } as SpeechSynthesisVoice;

function setup() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { value: false, writable: true });
  video.currentTime = 0.1;
  video.volume = 0.8;
  const videoRef = { current: video };
  const hook = renderHook(() => useVoiceDub(videoRef, segments, voice));
  const line = () => speech.speak.mock.calls.at(-1)![0] as SpeechSynthesisUtterance;
  return { video, line, ...hook };
}

describe('voice dub playback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVolume(0.8);
    setDubMix(DEFAULT_DUB_MIX);
    speech.speak.mockClear();
    speech.cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps the original quiet before speech, after completion and between lines', () => {
    const { video, line } = setup();
    expect(video.volume).toBeCloseTo(0.008);
    expect(line().volume).toBe(0.8);
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.008);
    act(() => line().onend?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.008);
    act(() => vi.advanceTimersByTime(200));
    expect(speech.speak).toHaveBeenCalledTimes(1);
    act(() => { video.currentTime = 3.5; vi.advanceTimersByTime(100); });
    expect(video.volume).toBeCloseTo(0.008);
    act(() => { video.currentTime = 4.1; vi.advanceTimersByTime(100); });
    expect(line().volume).toBe(0.8);
    expect(video.volume).toBeCloseTo(0.008);
  });

  it('preserves slider changes during speech and after pausing', () => {
    const { video, line, unmount } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => setVolume(0.5));
    act(() => vi.advanceTimersByTime(120));
    expect(video.volume).toBeCloseTo(0.005);
    expect(line().volume).toBe(0.5);
    act(() => { Object.defineProperty(video, 'paused', { value: true }); video.dispatchEvent(new Event('pause')); });
    expect(video.volume).toBeCloseTo(0.005);
    expect(speech.cancel).toHaveBeenCalled();
    unmount();
    expect(video.volume).toBe(0.5);
  });

  it('keeps the original on a speech failure and stops retrying the failed voice', () => {
    const { video, line } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => line().onerror?.({ error: 'not-allowed' } as SpeechSynthesisErrorEvent));
    expect(video.volume).toBe(0.8);
    act(() => { video.currentTime = 4.1; vi.advanceTimersByTime(200); });
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('ignores completion from a cancelled line after the next line starts', () => {
    const { video, line, unmount } = setup();
    const first = line();
    act(() => first.onstart?.({} as SpeechSynthesisEvent));
    act(() => { video.currentTime = 4.1; vi.advanceTimersByTime(100); });
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => first.onend?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.008);
    unmount();
    expect(video.volume).toBe(0.8);
  });

  it('uses the latest viewer volume for the next dub line', () => {
    const { video, line } = setup();
    act(() => setVolume(0.4));
    act(() => vi.advanceTimersByTime(120));
    act(() => { video.currentTime = 4.1; vi.advanceTimersByTime(100); });
    expect(line().volume).toBeCloseTo(0.4);
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.004);
  });

  it.each(['mute', 'zero volume'])('stops the dub when the viewer selects %s', (control) => {
    const { video, line } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    speech.cancel.mockClear();
    act(() => {
      if (control === 'mute') video.muted = true;
      else setVolume(0);
      video.dispatchEvent(new Event('volumechange'));
      video.currentTime = 4.1;
      vi.advanceTimersByTime(100);
    });
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(video.volume).toBeCloseTo(control === 'mute' ? 0.008 : 0);
  });

  it('keeps the original quiet through seeking and restores it when dubbing is disabled', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, writable: true });
    video.currentTime = 0.1;
    video.volume = 0.8;
    const videoRef = { current: video };
    const { rerender } = renderHook(({ enabled }) => useVoiceDub(videoRef, enabled ? segments : null, voice), {
      initialProps: { enabled: true },
    });
    act(() => { video.dispatchEvent(new Event('seeking')); video.currentTime = 3.5; });
    expect(video.volume).toBeCloseTo(0.008);
    act(() => video.dispatchEvent(new Event('seeked')));
    expect(video.volume).toBeCloseTo(0.008);
    rerender({ enabled: false });
    expect(video.volume).toBe(0.8);
  });

  it('prevents player writes from undoing the mix or changing the voice level', () => {
    const { video, line } = setup();
    act(() => applyVideoVolume(video, 0.8));
    expect(video.volume).toBeCloseTo(0.008, 6);
    act(() => { video.volume = 1; video.dispatchEvent(new Event('volumechange')); });
    expect(video.volume).toBeCloseTo(0.008, 6);
    expect(line().volume).toBe(0.8);
  });

  it('silences the original independently, without cancelling or replaying the voice', () => {
    const { video } = setup();
    speech.cancel.mockClear();
    act(() => setDubMix({ original: 0 }));
    act(() => { video.dispatchEvent(new Event('volumechange')); vi.advanceTimersByTime(300); });
    expect(video.volume).toBe(0);
    expect(speech.cancel).not.toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    act(() => setDubMix({ original: 0.5 }));
    expect(video.volume).toBeCloseTo(0.2, 6);
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('applies voice changes to current speech and preserves the original through voice mute', () => {
    const { video, line } = setup();
    act(() => line().onboundary?.({ charIndex: 1 } as SpeechSynthesisEvent));
    act(() => setDubMix({ voice: 0.5 }));
    act(() => vi.advanceTimersByTime(120));
    expect(line().text).toBe('ola');
    expect(line().volume).toBeCloseTo(0.2, 6);
    expect(video.volume).toBeCloseTo(0.008, 6);
    act(() => setDubMix({ voice: 0 }));
    act(() => vi.advanceTimersByTime(300));
    expect(speech.speak).toHaveBeenCalledTimes(2);
    expect(video.volume).toBeCloseTo(0.008, 6);
    act(() => setDubMix({ voice: 1 }));
    act(() => vi.advanceTimersByTime(120));
    expect(line().volume).toBe(0.8);
    expect(speech.speak).toHaveBeenCalledTimes(3);
  });

});
