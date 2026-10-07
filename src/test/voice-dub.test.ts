import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceDub } from '@/hooks/use-voice-dub';

const speech = vi.hoisted(() => ({ speak: vi.fn(), cancel: vi.fn() }));
vi.mock('@/hooks/dub-preference', () => ({ synth: () => speech }));

const segments = [{ start: 0, end: 3, text: 'Hola' }, { start: 4, end: 7, text: 'Adiós' }];
const voice = { lang: 'es-ES' } as SpeechSynthesisVoice;

function setup() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { value: false, writable: true });
  video.currentTime = 0.1;
  video.volume = 0.8;
  const hook = renderHook(() => useVoiceDub({ current: video }, segments, voice));
  const line = () => speech.speak.mock.calls.at(-1)![0] as SpeechSynthesisUtterance;
  return { video, line, ...hook };
}

describe('voice dub playback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    speech.speak.mockClear();
    speech.cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps the original until speech starts, lowers it to 6%, and restores it after the line', () => {
    const { video, line } = setup();
    expect(video.volume).toBe(0.8);
    expect(line().volume).toBe(0.8);
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.048);
    act(() => line().onend?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBe(0.8);
    act(() => vi.advanceTimersByTime(200));
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('restores the latest slider volume after pausing', () => {
    const { video, line } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => { video.volume = 0.5; video.dispatchEvent(new Event('volumechange')); });
    expect(video.volume).toBeCloseTo(0.03);
    act(() => { Object.defineProperty(video, 'paused', { value: true }); video.dispatchEvent(new Event('pause')); });
    expect(video.volume).toBe(0.5);
    expect(speech.cancel).toHaveBeenCalled();
  });

  it('restores the original on a speech failure and stops retrying the failed voice', () => {
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
    expect(video.volume).toBeCloseTo(0.048);
    unmount();
    expect(video.volume).toBe(0.8);
  });
});
