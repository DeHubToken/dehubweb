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

  it('keeps the original 20% lower before, during and after each line with voice 10% higher', () => {
    const { video, line } = setup();
    expect(video.volume).toBeCloseTo(0.64);
    expect(line().volume).toBeCloseTo(0.88);
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.64);
    act(() => line().onend?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.64);
    act(() => vi.advanceTimersByTime(200));
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('applies the balance to slider changes without restoring full volume on pause', () => {
    const { video, line } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => { video.volume = 0.5; video.dispatchEvent(new Event('volumechange')); });
    expect(video.volume).toBeCloseTo(0.4);
    expect(line().volume).toBeCloseTo(0.55);
    act(() => { Object.defineProperty(video, 'paused', { value: true }); video.dispatchEvent(new Event('pause')); });
    expect(video.volume).toBeCloseTo(0.4);
    expect(speech.cancel).toHaveBeenCalled();
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
    expect(video.volume).toBeCloseTo(0.64);
    unmount();
    expect(video.volume).toBe(0.8);
  });

  it('uses the latest viewer volume for the next dub line', () => {
    const { video, line } = setup();
    act(() => { video.volume = 0.4; video.dispatchEvent(new Event('volumechange')); });
    act(() => { video.currentTime = 4.1; vi.advanceTimersByTime(100); });
    expect(line().volume).toBeCloseTo(0.44);
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    expect(video.volume).toBeCloseTo(0.32);
  });

  it.each(['mute', 'zero volume'])('stops the dub when the viewer selects %s', (control) => {
    const { video, line } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    speech.cancel.mockClear();
    act(() => {
      if (control === 'mute') video.muted = true;
      else video.volume = 0;
      video.dispatchEvent(new Event('volumechange'));
      video.currentTime = 4.1;
      vi.advanceTimersByTime(100);
    });
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(video.volume).toBeCloseTo(control === 'mute' ? 0.64 : 0);
  });

  it('keeps the lower original volume through gaps, seeks and stopping the dub', () => {
    const { video, line, unmount } = setup();
    act(() => line().onstart?.({} as SpeechSynthesisEvent));
    act(() => line().onend?.({} as SpeechSynthesisEvent));
    act(() => { video.currentTime = 3.5; vi.advanceTimersByTime(100); });
    expect(video.volume).toBeCloseTo(0.64);
    act(() => video.dispatchEvent(new Event('seeking')));
    expect(video.volume).toBeCloseTo(0.64);
    unmount();
    expect(video.volume).toBe(0.8);
  });

  it('caps the boosted voice at the playback maximum and restores the latest viewer level', () => {
    const { video, line, unmount } = setup();
    act(() => { video.volume = 1; video.dispatchEvent(new Event('volumechange')); });
    expect(video.volume).toBeCloseTo(0.8);
    expect(line().volume).toBe(1);
    unmount();
    expect(video.volume).toBe(1);
  });
});
