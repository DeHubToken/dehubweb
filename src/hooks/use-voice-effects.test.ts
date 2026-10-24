import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVoiceEffects } from './use-voice-effects';

afterEach(() => vi.unstubAllGlobals());

it('keeps microphone audio off the local speaker when starting and switching effects', async () => {
  const connects: ReturnType<typeof vi.fn>[] = [];
  const node = () => {
    const connect = vi.fn();
    connects.push(connect);
    return { connect, disconnect: vi.fn(), frequency: { value: 0 }, Q: { value: 0 } };
  };
  const speaker = {};
  const track = {};
  const broadcast = { stream: { getAudioTracks: () => [track] } };
  const context = {
    state: 'running', destination: speaker,
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    createMediaStreamSource: node,
    createMediaStreamDestination: () => broadcast,
    createBiquadFilter: node, createWaveShaper: node,
  };
  vi.stubGlobal('AudioContext', vi.fn(function () { return context; }));
  const { result } = renderHook(() => useVoiceEffects());
  await act(async () => {
    expect(await result.current.processStream({} as MediaStream)).toBe(track);
  });
  act(() => { expect(result.current.switchEffect('radio')).toBe(track); });
  act(() => { expect(result.current.switchEffect('none')).toBe(track); });

  expect(connects.some(connect => connect.mock.calls.some(([target]) => target === broadcast))).toBe(true);
  for (const connect of connects) expect(connect).not.toHaveBeenCalledWith(speaker);
  act(() => result.current.cleanup());
});
