import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSignInWall, noteSignInWall, resetSignInWallForTests, SIGN_IN_WALL_EVENT } from '@/lib/sign-in-wall';

describe('sign-in wall', () => {
  afterEach(() => resetSignInWallForTests());

  it('spots the walled page and nothing else', () => {
    expect(isSignInWall({ result: [], signInRequired: true })).toBe(true);
    expect(isSignInWall({ result: [], pagination: { hasMore: false } })).toBe(false);
    expect(isSignInWall(null)).toBe(false);
  });

  it('asks for sign-in once a minute at most', () => {
    const seen = vi.fn();
    window.addEventListener(SIGN_IN_WALL_EVENT, seen);
    noteSignInWall({ result: [] });
    noteSignInWall({ result: [], signInRequired: true });
    noteSignInWall({ result: [], signInRequired: true });
    window.removeEventListener(SIGN_IN_WALL_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
