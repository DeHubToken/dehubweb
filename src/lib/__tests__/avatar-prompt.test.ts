import { beforeEach, describe, expect, it } from 'vitest';
import {
  AVATAR_PROMPT_GAP_MS,
  hasNoAvatar,
  isAvatarPromptDue,
  markAvatarPromptSignupSession,
  recordAvatarPromptShown,
} from '@/lib/avatar-prompt';

describe('avatar prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('treats a missing or empty picture as no avatar', () => {
    expect(hasNoAvatar({ avatarImageUrl: null })).toBe(true);
    expect(hasNoAvatar({ avatarImageUrl: '  ' })).toBe(true);
    expect(hasNoAvatar({})).toBe(true);
    expect(hasNoAvatar({ avatarImageUrl: 'avatars/0xabc.png' })).toBe(false);
    expect(hasNoAvatar(null)).toBe(false);
  });

  it('asks three times at most, days apart', () => {
    const t0 = 1_000_000;
    expect(isAvatarPromptDue('0xAbc', t0)).toBe(true);
    recordAvatarPromptShown('0xAbc', t0);
    expect(isAvatarPromptDue('0xabc', t0 + 60_000)).toBe(false);
    const t1 = t0 + AVATAR_PROMPT_GAP_MS;
    expect(isAvatarPromptDue('0xabc', t1)).toBe(true);
    recordAvatarPromptShown('0xabc', t1);
    const t2 = t1 + AVATAR_PROMPT_GAP_MS;
    recordAvatarPromptShown('0xabc', t2);
    expect(isAvatarPromptDue('0xabc', t2 + AVATAR_PROMPT_GAP_MS * 10)).toBe(false);
  });

  it('skips the open that ran sign-up', () => {
    markAvatarPromptSignupSession();
    expect(isAvatarPromptDue('0xabc')).toBe(false);
  });
});
