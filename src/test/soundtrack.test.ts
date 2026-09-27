import { describe, expect, it } from 'vitest';
import { buildSoundtrackTag, parseSoundtrackTag } from '@/lib/soundtrack';

describe('soundtrack metadata', () => {
  it('reads old tags and relative paths', () => {
    expect(parseSoundtrackTag('[soundtrack:42:Song:Artist]').soundtrackUrl).toBe('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/feed-audio/42-audio.mp3');
    expect(parseSoundtrackTag('[soundtrack:42:Song:Artist:uploads/song.m4a]').soundtrackUrl).toContain('/uploads/song.m4a');
  });
  it('preserves a full audio URL', () => {
    expect(parseSoundtrackTag('[soundtrack:42:Song:Artist:https://example.com/song.mp3?x=1]').soundtrackUrl).toBe('https://example.com/song.mp3?x=1');
  });
  it('round trips punctuation, brackets, Unicode, and percent signs', () => {
    const sound = { tokenId: '42', title: 'Night: [live] 100% 🎵', creator: 'A:B', url: 'https://example.com/song.mp3' };
    expect(parseSoundtrackTag(buildSoundtrackTag(sound))).toEqual({ soundtrackTitle: sound.title, soundtrackCreator: sound.creator, soundtrackUrl: sound.url });
  });
  it('rejects non-media schemes and tolerates legacy percent signs', () => {
    expect(parseSoundtrackTag('[soundtrack:42:Song:Artist:javascript:alert(1)]')).toEqual({});
    expect(parseSoundtrackTag('[soundtrack:42:100%:Artist]').soundtrackTitle).toBe('100%');
  });
});
