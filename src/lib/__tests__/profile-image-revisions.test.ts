import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub/core';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl, buildCoverUrl, bumpProfileImageVersion, cdnImageSource, getExtension } from '@/lib/media-url';

afterEach(() => vi.restoreAllMocks());

describe('profile image revisions', () => {
  const hash = '0123456789abcdef0123456789abcdef';

  it('keeps unchanged legacy sources stable across hours and days', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const first = [buildAvatarUrl('0xstable', 'avatars/0xstable.jpg'), buildCoverUrl('0xstable', 'covers/0xstable.webp'), buildAvatarCdnFallbackUrl('0xstable'), buildAvatarUrl('', `${DEHUB_CDN_BASE}avatars/unknown.jpg`)];
    clock.mockReturnValue(1_000_000 + 2 * 86_400_000);
    expect([buildAvatarUrl('0xstable', 'avatars/0xstable.jpg'), buildCoverUrl('0xstable', 'covers/0xstable.webp'), buildAvatarCdnFallbackUrl('0xstable'), buildAvatarUrl('', `${DEHUB_CDN_BASE}avatars/unknown.jpg`)]).toEqual(first);
  });

  it('uses the uploaded content key through resizing, cover normalization and direct fallback', () => {
    const avatar = `avatars/0xrevision-${hash}.webp`;
    const cover = `covers/0xrevision-${hash}.jpg`;
    const source = `${DEHUB_CDN_BASE}${avatar}`;
    expect(cdnImageSource(buildAvatarUrl('0xrevision', avatar))).toBe(source);
    expect(buildAvatarCdnFallbackUrl('0xrevision', avatar)).toBe(source);
    expect(cdnImageSource(buildCoverUrl('0xrevision', `statics/${cover}`))).toBe(`${DEHUB_CDN_BASE}${cover}`);
    expect(cdnImageSource(buildCoverUrl('0xrevision', `https://api.dehub.io/statics/${cover}`))).toBe(`${DEHUB_CDN_BASE}${cover}`);
    expect(buildAvatarCdnFallbackUrl('0xrevision', avatar)).not.toContain('/cdn-cgi/image/');
  });

  it('retains explicit local invalidation for old keys without changing revision keys', () => {
    const old = buildAvatarUrl('0xupload', 'avatars/0xupload.jpg');
    const revised = buildAvatarUrl('0xupload', `avatars/0xupload-${hash}.jpg`);
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    bumpProfileImageVersion('0xupload');
    expect(buildAvatarUrl('0xupload', 'avatars/0xupload.jpg')).not.toBe(old);
    expect(buildAvatarUrl('0xupload', `avatars/0xupload-${hash}.jpg`)).toBe(revised);
  });

  it('preserves previews, external sources and extensions with query strings', () => {
    expect(buildAvatarUrl('0x1', 'blob:preview')).toBe('blob:preview');
    expect(buildCoverUrl('0x1', 'https://external.example/cover.webp?version=2')).toBe('https://external.example/cover.webp?version=2');
    expect(getExtension('covers/x.webp?v=2#image')).toBe('webp');
    expect(buildAvatarUrl('0x1', `${DEHUB_CDN_BASE}avatars/x.webp?v=saved`)).not.toContain('&v=');
  });
});
