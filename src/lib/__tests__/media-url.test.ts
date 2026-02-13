import { describe, it, expect } from 'vitest';
import {
  DEHUB_CDN_BASE,
} from '@/lib/api/dehub/core';
import {
  getExtension,
  buildAvatarUrl,
  buildCoverUrl,
  buildImageUrl,
  buildVideoUrl,
  buildFeedImageUrls,
  extractAvatarPath,
} from '@/lib/media-url';

// ── getExtension ──

describe('getExtension', () => {
  it('extracts common extensions', () => {
    expect(getExtension('avatars/0x123.jpg')).toBe('jpg');
    expect(getExtension('file.png')).toBe('png');
    expect(getExtension('path/to/file.gif')).toBe('gif');
  });

  it('handles octet-stream extension', () => {
    expect(getExtension('statics/avatars/0x123.octet-stream')).toBe('octet-stream');
  });

  it('defaults to jpg when no extension', () => {
    expect(getExtension('noext')).toBe('jpg');
  });
});

// ── extractAvatarPath ──

describe('extractAvatarPath', () => {
  it('returns undefined for null/undefined', () => {
    expect(extractAvatarPath(null)).toBeUndefined();
    expect(extractAvatarPath(undefined)).toBeUndefined();
  });

  it('picks fields in priority order', () => {
    expect(extractAvatarPath({ avatarImageUrl: 'a', avatarUrl: 'b' })).toBe('a');
    expect(extractAvatarPath({ avatarUrl: 'b', avatar_url: 'c' })).toBe('b');
    expect(extractAvatarPath({ minterAvatarUrl: 'd' })).toBe('d');
    expect(extractAvatarPath({ actorAvatar: 'e' })).toBe('e');
  });

  it('returns undefined when no known field exists', () => {
    expect(extractAvatarPath({ name: 'test' })).toBeUndefined();
  });
});

// ── buildAvatarUrl ──

describe('buildAvatarUrl', () => {
  const addr = '0xabc';

  it('returns undefined for falsy path or address', () => {
    expect(buildAvatarUrl(addr, null)).toBeUndefined();
    expect(buildAvatarUrl(addr, undefined)).toBeUndefined();
    expect(buildAvatarUrl('', 'avatars/x.jpg')).toBeUndefined();
  });

  it('returns dehubcdn URLs as-is', () => {
    const url = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xabc.jpg';
    expect(buildAvatarUrl(addr, url)).toBe(url);
  });

  it('converts api.dehub.io URLs to CDN', () => {
    const apiUrl = 'https://api.dehub.io/avatars/0xabc.png';
    expect(buildAvatarUrl(addr, apiUrl)).toBe(`${DEHUB_CDN_BASE}avatars/${addr}.png`);
  });

  it('passes through external URLs', () => {
    const ext = 'https://dicebear.com/avatar.svg';
    expect(buildAvatarUrl(addr, ext)).toBe(ext);
  });

  it('builds CDN URL from relative path', () => {
    expect(buildAvatarUrl(addr, 'avatars/0xabc.jpg')).toBe(`${DEHUB_CDN_BASE}avatars/${addr}.jpg`);
  });
});

// ── buildCoverUrl ──

describe('buildCoverUrl', () => {
  it('returns undefined for falsy path', () => {
    expect(buildCoverUrl('0x1', null)).toBeUndefined();
  });

  it('returns absolute URLs as-is', () => {
    expect(buildCoverUrl('0x1', 'https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });

  it('builds CDN URL from relative', () => {
    expect(buildCoverUrl('0x1', 'covers/0x1.gif')).toBe(`${DEHUB_CDN_BASE}covers/0x1.gif`);
  });
});

// ── buildImageUrl ──

describe('buildImageUrl', () => {
  it('returns empty string for falsy path', () => {
    expect(buildImageUrl(123, null)).toBe('');
  });

  it('returns absolute URL as-is', () => {
    expect(buildImageUrl(1, 'https://x.com/1.png')).toBe('https://x.com/1.png');
  });

  it('builds CDN URL stripping nfts/ prefix', () => {
    expect(buildImageUrl(61, 'nfts/images/61.jpeg')).toBe(`${DEHUB_CDN_BASE}images/61.jpeg`);
  });
});

// ── buildVideoUrl ──

describe('buildVideoUrl', () => {
  it('builds correct video URL', () => {
    expect(buildVideoUrl(42)).toBe(`${DEHUB_CDN_BASE}videos/42.mp4`);
  });
});

// ── buildFeedImageUrls ──

describe('buildFeedImageUrls', () => {
  it('returns undefined for empty/null input', () => {
    expect(buildFeedImageUrls(null)).toBeUndefined();
    expect(buildFeedImageUrls([])).toBeUndefined();
  });

  it('passes through absolute URLs', () => {
    const urls = ['https://example.com/a.jpg'];
    expect(buildFeedImageUrls(urls)).toEqual(urls);
  });

  it('builds CDN URLs from relative feed-images paths', () => {
    const result = buildFeedImageUrls(['feed-images/abc.jpg']);
    expect(result).toEqual([`${DEHUB_CDN_BASE}feed-images/abc.jpg`]);
  });
});
