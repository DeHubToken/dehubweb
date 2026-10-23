import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('@/lib/audio-session');

async function load(): Promise<Mod> {
  vi.resetModules();
  return import('@/lib/audio-session');
}

let session: { type: string };

beforeEach(() => {
  session = { type: 'auto' };
  Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
});

afterEach(() => {
  delete (navigator as unknown as { audioSession?: unknown }).audioSession;
});

describe('audio session', () => {
  it('asks for playback so Web Audio survives the ring switch', async () => {
    const { requestPlaybackAudioSession } = await load();
    requestPlaybackAudioSession();
    expect(session.type).toBe('playback');
  });

  it('opens the mic on the default session and gives playback back after', async () => {
    const { requestPlaybackAudioSession, holdMicAudioSession } = await load();
    requestPlaybackAudioSession();
    const release = holdMicAudioSession();
    expect(session.type).toBe('auto');
    requestPlaybackAudioSession();
    expect(session.type).toBe('auto');
    release();
    expect(session.type).toBe('playback');
  });

  it('restores whatever another part of the page had set', async () => {
    const { holdMicAudioSession } = await load();
    session.type = 'playback';
    const release = holdMicAudioSession();
    expect(session.type).toBe('auto');
    release();
    expect(session.type).toBe('playback');
  });

  it('waits for the last of several mics', async () => {
    const { holdMicAudioSession, requestPlaybackAudioSession } = await load();
    requestPlaybackAudioSession();
    const a = holdMicAudioSession();
    const b = holdMicAudioSession();
    a();
    a();
    expect(session.type).toBe('auto');
    b();
    expect(session.type).toBe('playback');
  });

  it('does nothing in browsers without the API', async () => {
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
    const { holdMicAudioSession, requestPlaybackAudioSession } = await load();
    expect(() => { requestPlaybackAudioSession(); holdMicAudioSession()(); }).not.toThrow();
  });
});
