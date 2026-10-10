import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRecorder } from '@/components/app/chat/VoiceRecorder';
import { createVoiceRecorder, voiceRecordingFile } from '@/lib/voice-recording';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

let supported: string;
let current: Recorder;
class Recorder {
  static isTypeSupported(type: string) { return type === supported; }
  state = 'inactive';
  mimeType: string;
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor(public stream: MediaStream, options?: { mimeType: string }) {
    this.mimeType = options?.mimeType || 'audio/mp4';
    current = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
const getUserMedia = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  supported = 'audio/webm;codecs=opus';
  getUserMedia.mockResolvedValue(stream);
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('voice recording across chat surfaces', () => {
  it.each(['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'])('keeps %s bytes and MIME aligned', async type => {
    supported = type;
    const complete = vi.fn();
    const view = render(<VoiceRecorder onRecordingComplete={complete} />);
    await act(async () => { fireEvent.click(view.getByRole('button')); });
    act(() => { vi.advanceTimersByTime(1100); fireEvent.click(view.getByRole('button')); });
    const [blob] = complete.mock.calls[0];
    expect(blob.type).toBe(type.split(';')[0]);
    const file = voiceRecordingFile(blob);
    expect(file.type).toBe(blob.type);
    expect(file.name).toMatch(type.includes('mp4') ? /\.m4a$/ : type.includes('ogg') ? /\.ogg$/ : /\.webm$/);
    expect(stopTrack).toHaveBeenCalled();
  });

  it('stops public recordings below the 30 second server limit', async () => {
    const complete = vi.fn();
    const view = render(<VoiceRecorder onRecordingComplete={complete} />);
    await act(async () => { fireEvent.click(view.getByRole('button')); });
    act(() => vi.advanceTimersByTime(29_000));
    expect(current.state).toBe('inactive');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][1]).toBe(29);
  });

  it('allows the separate DM limit and releases the microphone when closed', async () => {
    const complete = vi.fn();
    const view = render(<VoiceRecorder onRecordingComplete={complete} maxDuration={59} />);
    await act(async () => { fireEvent.click(view.getByRole('button')); });
    act(() => vi.advanceTimersByTime(30_000));
    expect(current.state).toBe('recording');
    view.unmount();
    expect(stopTrack).toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('releases a permission response arriving after the composer closed', async () => {
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
    const complete = vi.fn();
    const view = render(<VoiceRecorder onRecordingComplete={complete} />);
    fireEvent.click(view.getByRole('button'));
    view.unmount();
    await act(async () => resolve(stream));
    expect(stopTrack).toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('lets the browser choose when no explicit MIME is supported', () => {
    supported = '';
    expect(createVoiceRecorder(stream).mimeType).toBe('audio/mp4');
  });
});
