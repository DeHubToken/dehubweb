import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/media-session', () => ({
  claimMediaSession: vi.fn(),
  releaseMediaSession: vi.fn(),
  setMediaSessionPlaying: vi.fn(),
  setMediaSessionPosition: vi.fn(),
}));

import { popOutAudioPost, stopAudioPost } from '@/lib/audio-post-playback';
import { isAudioPostPoppedOut } from '@/lib/audio-post-popout';

/**
 * The corner player is mounted app-wide so a popped-out track survives
 * navigation, but it renders nothing until somebody pops one out. Reading the
 * engine to find that out put the engine, its panel and the panel's waveform on
 * the boot path — parsed before first paint, for something almost nobody opens.
 * The flag lives in its own small module and the engine pushes to it.
 */
describe('the corner player gate', () => {
  afterEach(() => {
    stopAudioPost();
  });

  it('is raised when a track pops out and dropped when it stops', () => {
    const el = document.createElement('audio');
    vi.spyOn(el, 'play').mockResolvedValue(undefined);
    vi.spyOn(el, 'pause').mockImplementation(() => {});
    Object.defineProperty(el, 'duration', { value: 100, configurable: true });

    expect(isAudioPostPoppedOut()).toBe(false);

    popOutAudioPost({
      track: { tokenId: '42', audioUrl: 'x.mp3', title: 'Late night', artist: 'nick' },
      graph: { el, source: null, analyser: null },
      startAt: null,
    });
    expect(isAudioPostPoppedOut()).toBe(true);

    stopAudioPost();
    expect(isAudioPostPoppedOut()).toBe(false);
  });
});

describe('AppLayout keeps the corner player off the boot path', () => {
  const SOURCE = readFileSync(resolve(__dirname, '../components/app/AppLayout.tsx'), 'utf8');

  it('reaches the panel through React.lazy, gated on the flag', () => {
    expect(SOURCE).toContain("import('@/components/app/audio/AudioPostMiniPlayer')");
    expect(SOURCE).toContain('{hasPoppedOutAudio && (');
  });

  it('does not statically import the playback engine', () => {
    // Importing it here is what put 15 KB on the boot path. The whole point of
    // lib/audio-post-popout is that the shell only needs one boolean.
    expect(SOURCE).not.toContain("from '@/lib/audio-post-playback'");
    expect(SOURCE).toContain("from '@/lib/audio-post-popout'");
  });
});
