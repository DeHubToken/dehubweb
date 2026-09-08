import { describe, expect, it } from 'vitest';
import { ASSISTANT_ADDRESS, ASSISTANT_AVATAR } from '@/lib/assistant';
import { buildAvatarCdnFallbackUrl, buildAvatarUrl } from '@/lib/media-url';

describe('assistant avatar', () => {
  it('overrides an older API profile image with the bundled asset', () => {
    expect(buildAvatarUrl(ASSISTANT_ADDRESS, 'avatars/old-assistant.png')).toBe(ASSISTANT_AVATAR);
  });

  it('uses the bundled asset for CDN fallback paths too', () => {
    expect(buildAvatarCdnFallbackUrl(ASSISTANT_ADDRESS, 'avatars/old-assistant.png')).toBe(ASSISTANT_AVATAR);
  });

  it('matches the assistant address case-insensitively', () => {
    expect(buildAvatarUrl(ASSISTANT_ADDRESS.toUpperCase(), null)).toBe(ASSISTANT_AVATAR);
  });
});
