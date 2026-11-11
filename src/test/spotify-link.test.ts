import { describe, expect, it } from 'vitest';
import { cleanSpotifyTitle, parseSpotifyLink, spotifyEmbedUrl } from '@/lib/spotify';

describe('parseSpotifyLink', () => {
  it('reads every share link shape', () => {
    expect(parseSpotifyLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc')?.uri).toBe('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(parseSpotifyLink('https://open.spotify.com/intl-de/album/4LH4d3cOWNNsVw41Gqt2kv')?.kind).toBe('album');
    expect(parseSpotifyLink('open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M')?.url).toBe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    expect(parseSpotifyLink('spotify:episode:4rOoJ6Egrf8K2IrywzwOMk')?.kind).toBe('episode');
  });

  it('ignores anything that is not a Spotify item', () => {
    expect(parseSpotifyLink('https://open.spotify.com/user/abc')).toBeNull();
    expect(parseSpotifyLink('https://open.spotify.com/track/short')).toBeNull();
    expect(parseSpotifyLink('https://evil.com/open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBeNull();
    expect(parseSpotifyLink('https://open.spotify.com.evil.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBeNull();
    expect(parseSpotifyLink('')).toBeNull();
  });

  it('builds the embed address', () => {
    const link = parseSpotifyLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')!;
    expect(spotifyEmbedUrl(link)).toBe('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator&theme=0');
  });
});

describe('cleanSpotifyTitle', () => {
  it('drops Spotify page boilerplate', () => {
    expect(cleanSpotifyTitle('Listen to The Dark Side of the Moon - Album by Pink Floyd | Spotify')).toBe('The Dark Side of the Moon');
    expect(cleanSpotifyTitle('Never Gonna Give You Up')).toBe('Never Gonna Give You Up');
  });
});

describe('profile grid card for a Spotify post', () => {
  it('turns a Spotify link into a playable Spotify tile, ahead of other links', async () => {
    const { textCardOf } = await import('@/lib/grid-card');
    expect(textCardOf({ content: 'listen https://example.com/x and https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' }))
      .toEqual({ kind: 'spotify', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' });
    expect(textCardOf({ content: 'read https://example.com/x' })).toEqual({ kind: 'link', url: 'https://example.com/x' });
  });
});
