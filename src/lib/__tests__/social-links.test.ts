import { describe, it, expect } from 'vitest';
import { normalizeSocialUrl } from '../social-links';

describe('normalizeSocialUrl', () => {
  it.each([
    ['twitterLink', 'r2r_air', 'https://x.com/r2r_air'],
    ['twitterLink', '@r2r_air', 'https://x.com/r2r_air'],
    ['instagramLink', 'r2r_officiel', 'https://instagram.com/r2r_officiel'],
    ['instagramLink', '@r2r.officiel', 'https://instagram.com/r2r.officiel'],
    ['youtubeLink', '@dehub', 'https://youtube.com/@dehub'],
    ['tiktokLink', 'dehub', 'https://tiktok.com/@dehub'],
    ['telegramLink', 'dehub_dhb', 'https://t.me/dehub_dhb'],
    ['discordLink', 'dehub', 'https://discord.gg/dehub'],
    ['twitterLink', 'twitter.com/r2r_air', 'https://twitter.com/r2r_air'],
    ['instagramLink', '//instagram.com/r2r_officiel', 'https://instagram.com/r2r_officiel'],
  ])('opens %s handle %s on its platform', (key, value, expected) => {
    expect(normalizeSocialUrl(key, value)).toBe(expected);
  });

  it('rewrites a bare YouTube custom URL to the @handle form', () => {
    // youtube.com/lcs_game 404s; youtube.com/@lcs_game is the same channel.
    expect(normalizeSocialUrl('youtubeLink', 'youtube.com/lcs_game')).toBe(
      'https://www.youtube.com/@lcs_game'
    );
  });

  it('leaves a handle that is already in @ form alone', () => {
    expect(normalizeSocialUrl('youtubeLink', 'https://youtube.com/@lcs_game')).toBe(
      'https://youtube.com/@lcs_game'
    );
  });

  it('leaves real YouTube routes alone', () => {
    expect(normalizeSocialUrl('youtubeLink', 'youtube.com/channel/UC123')).toBe(
      'https://youtube.com/channel/UC123'
    );
    expect(normalizeSocialUrl('youtubeLink', 'youtube.com/watch')).toBe(
      'https://youtube.com/watch'
    );
  });

  it('rewrites a bare TikTok path to the @handle form', () => {
    expect(normalizeSocialUrl('tiktokLink', 'tiktok.com/lastchadstanding')).toBe(
      'https://www.tiktok.com/@lastchadstanding'
    );
  });

  it('does not touch platforms that still serve bare handles', () => {
    expect(normalizeSocialUrl('instagramLink', 'instagram.com/lastchadstanding')).toBe(
      'https://instagram.com/lastchadstanding'
    );
    expect(normalizeSocialUrl('twitterLink', 'https://x.com/lcs_game')).toBe(
      'https://x.com/lcs_game'
    );
  });

  it('adds a scheme to anything it does not recognise', () => {
    expect(normalizeSocialUrl('facebookLink', 'facebook.com/dehub')).toBe(
      'https://facebook.com/dehub'
    );
  });
});
