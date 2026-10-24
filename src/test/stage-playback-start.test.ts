import { afterEach, expect, it, vi } from 'vitest';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => Promise.resolve({}) } }));
vi.mock('sonner', () => ({ toast: { error: toastError, info: vi.fn() } }));
vi.mock('@/lib/stage-recording-source', () => ({ playableStageRecording: async (_id: string, url: string) => url }));
vi.mock('@/lib/audio-session', () => ({ requestPlaybackAudioSession: vi.fn() }));
vi.mock('@/lib/media-session', () => ({ claimMediaSession: vi.fn(), releaseMediaSession: vi.fn(), setMediaSessionPlaying: vi.fn(), setMediaSessionPosition: vi.fn() }));
vi.mock('@/lib/video-preferences', () => ({ PLAYBACK_RATES: [1, 1.5, 2] }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (_key: string, options: { defaultValue: string }) => options.defaultValue }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps the recording loaded when dubbing pauses an unfinished play request', async () => {
  vi.resetModules();
  const audio = document.createElement('audio');
  let rejectPlay!: (error: unknown) => void;
  const play = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }));
  Object.defineProperties(audio, { play: { value: play }, pause: { value: vi.fn() }, load: { value: vi.fn() } });
  vi.stubGlobal('Audio', function () { return audio; });
  const player = await import('@/lib/stage-playback');
  player.playStageRecording({ id: 'town-hall', recording_url: 'https://example.com/recording.m4a' });
  await Promise.resolve();
  expect(play).toHaveBeenCalledOnce();
  player.pauseStageRecording();
  rejectPlay(new DOMException('The play request was interrupted by pause', 'AbortError'));
  await vi.waitFor(() => expect(player.getStagePlaybackState().loading).toBe(false));
  expect(player.getStagePlaybackState()).toMatchObject({ spaceId: 'town-hall', paused: true });
  expect(audio.src).toBe('https://example.com/recording.m4a');
  expect(toastError).not.toHaveBeenCalled();
  player.stopStageRecording();
});
