import { describe, it, expect } from 'vitest';
import { normalizeSocialUrl } from '../social-links';

describe('normalizeSocialUrl', () => {
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
