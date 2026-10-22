import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMixRemote,
  closeRecordingMix,
  createRecordingMix,
  dropMixRemote,
  pickRecordingType,
  recordingFileFor,
  setMixLocal,
} from '@/lib/stage-recording-mix';

class FakeNode {
  connectedTo: unknown[] = [];
  constructor(public stream: unknown) {}
  connect(target: unknown) { this.connectedTo.push(target); }
  disconnect() { this.connectedTo = []; }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  closed = false;
  dest = { stream: { id: 'mix-out' } };
  sources: FakeNode[] = [];
  constructor() { FakeAudioContext.last = this; }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
  createMediaStreamDestination() { return this.dest; }
  createMediaStreamSource(stream: unknown) {
    const node = new FakeNode(stream);
    this.sources.push(node);
    return node;
  }
}

class FakeMediaStream {
  constructor(public tracks: unknown[] = []) {}
}

function withFakes() {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaStream', FakeMediaStream);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pickRecordingType', () => {
  it('records WebM/Opus wherever the browser can', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => t.startsWith('audio/webm') || t.startsWith('audio/mp4') });
    expect(pickRecordingType()).toBe('audio/webm;codecs=opus');
  });

  it('falls back to MP4 on Safari before 18.4 instead of throwing', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => t.startsWith('audio/mp4') });
    expect(pickRecordingType()).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('leaves the choice to the browser when it admits to nothing', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    expect(pickRecordingType()).toBeUndefined();
  });
});

describe('recordingFileFor', () => {
  it('names the upload after what was actually recorded', () => {
    expect(recordingFileFor('audio/webm;codecs=opus')).toEqual({ ext: 'webm', contentType: 'audio/webm' });
    expect(recordingFileFor('audio/mp4;codecs=mp4a.40.2')).toEqual({ ext: 'mp4', contentType: 'audio/mp4' });
    expect(recordingFileFor('')).toEqual({ ext: 'webm', contentType: 'audio/webm' });
  });
});

describe('recording mix', () => {
  it('records the host and every remote speaker into one destination', () => {
    withFakes();
    const mix = createRecordingMix()!;
    const ctx = FakeAudioContext.last!;
    setMixLocal(mix, { id: 'host' } as unknown as MediaStream);
    addMixRemote(mix, 101, { getMediaStreamTrack: () => ({ id: 'guest-a' }) as unknown as MediaStreamTrack });
    addMixRemote(mix, 102, { getMediaStreamTrack: () => ({ id: 'guest-b' }) as unknown as MediaStreamTrack });

    expect(ctx.sources).toHaveLength(3);
    expect(ctx.sources.every((n) => n.connectedTo[0] === ctx.dest)).toBe(true);
    expect(mix.remotes.size).toBe(2);
  });

  it('swaps only the host input when the voice effect changes', () => {
    withFakes();
    const mix = createRecordingMix()!;
    const ctx = FakeAudioContext.last!;
    setMixLocal(mix, { id: 'effect-a' } as unknown as MediaStream);
    addMixRemote(mix, 7, { getMediaStreamTrack: () => ({ id: 'guest' }) as unknown as MediaStreamTrack });
    const [first, guest] = ctx.sources;

    setMixLocal(mix, { id: 'effect-b' } as unknown as MediaStream);

    expect(first.connectedTo).toHaveLength(0);
    expect(guest.connectedTo[0]).toBe(ctx.dest);
    expect((mix.local as unknown as FakeNode).stream).toEqual({ id: 'effect-b' });
  });

  it('lets a speaker go and closes cleanly', () => {
    withFakes();
    const mix = createRecordingMix()!;
    const ctx = FakeAudioContext.last!;
    addMixRemote(mix, 'x', { getMediaStreamTrack: () => ({ id: 'guest' }) as unknown as MediaStreamTrack });
    dropMixRemote(mix, 'x');
    expect(mix.remotes.size).toBe(0);
    expect(ctx.sources[0].connectedTo).toHaveLength(0);

    closeRecordingMix(mix);
    expect(ctx.closed).toBe(true);
  });

  it('ignores a remote with no track yet', () => {
    withFakes();
    const mix = createRecordingMix()!;
    addMixRemote(mix, 1, null);
    addMixRemote(mix, 2, {});
    expect(mix.remotes.size).toBe(0);
  });
});
