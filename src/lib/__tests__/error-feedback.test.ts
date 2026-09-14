/**
 * The rate-limit tell, and the once-per-burst rule.
 *
 * Clicking Follow faster than the limiter allows produces a run of 429s inside
 * a second; the reader should hear one tone and read one toast, not twenty of
 * each.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock('i18next', () => ({
  default: { t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue },
}));

import { isRateLimitError, notifyRateLimited, playErrorSound } from '../error-feedback';

const start = vi.fn();

function stubAudio() {
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => ({ connect: vi.fn() })),
  };
  class FakeContext {
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createGain() { return gainNode; }
    createOscillator() {
      return {
        type: '', frequency: { value: 0 },
        connect: vi.fn(() => gainNode),
        start, stop: vi.fn(),
      };
    }
  }
  vi.stubGlobal('window', { AudioContext: FakeContext });
}

describe('isRateLimitError', () => {
  it('reads the status the api layer attaches', () => {
    expect(isRateLimitError(Object.assign(new Error('nope'), { status: 429 }))).toBe(true);
  });

  it('falls back to the message when there is no status', () => {
    expect(isRateLimitError(new Error('Too Many Requests'))).toBe(true);
    expect(isRateLimitError(new Error('429'))).toBe(true);
  });

  it('does not claim every failure', () => {
    expect(isRateLimitError(new Error('Network request failed'))).toBe(false);
    expect(isRateLimitError(Object.assign(new Error('x'), { status: 500 }))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe('notifyRateLimited', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubAudio();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sounds and speaks once per burst, then again after the window', () => {
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));
    notifyRateLimited();
    notifyRateLimited();
    notifyRateLimited();
    // Two oscillators make the one two-tone beep.
    expect(start).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe('Rate limited, slow down');

    vi.setSystemTime(new Date('2026-09-14T00:00:05Z'));
    playErrorSound();
    expect(start).toHaveBeenCalledTimes(4);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
