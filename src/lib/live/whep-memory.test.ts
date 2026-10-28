import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetWhepSilent, hasRealPicture, rememberWhepSilent, whepRecentlySilent } from './whep-memory';

describe('whep memory', () => {
  beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });

  it('remembers a silent stream and forgets it once it plays', () => {
    expect(whepRecentlySilent('abc')).toBe(false);
    rememberWhepSilent('abc');
    expect(whepRecentlySilent('abc')).toBe(true);
    forgetWhepSilent('abc');
    expect(whepRecentlySilent('abc')).toBe(false);
  });

  it('tries WebRTC again after half an hour', () => {
    vi.useFakeTimers();
    rememberWhepSilent('abc');
    vi.advanceTimersByTime(31 * 60_000);
    expect(whepRecentlySilent('abc')).toBe(false);
  });

  it('does not count the 2x2 placeholder as a picture', () => {
    expect(hasRealPicture({ videoWidth: 2, videoHeight: 2 } as HTMLVideoElement)).toBe(false);
    expect(hasRealPicture({ videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement)).toBe(true);
  });
});
