import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/ai-invoke', () => ({ dehubAuthHeaders: () => ({}) }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn() }));

import { computeSocialReach, hasSocialReach, type VerifiedSocialAccount } from './social-reach';

const account = (platform: string, followers: number | null): VerifiedSocialAccount => ({
  platform,
  username: 'creator',
  profileUrl: null,
  followers,
  followersUpdatedAt: null,
});

describe('computeSocialReach', () => {
  it('adds verified counts of connected accounts to DeHub followers, in display order', () => {
    const reach = computeSocialReach([account('youtube', 3400), account('twitter', 1200)], 50);
    expect(reach.dehub).toBe(50);
    expect(reach.socials.map((s) => s.platform)).toEqual(['twitter', 'youtube']);
    expect(reach.total).toBe(4650);
    expect(hasSocialReach(reach)).toBe(true);
  });

  it('ignores accounts with no reported count, zero, or an unsupported platform', () => {
    const reach = computeSocialReach(
      [account('twitter', null), account('instagram', 0), account('linkedin', 900), account('tiktok', -5)],
      10,
    );
    expect(reach.socials).toEqual([]);
    expect(reach.total).toBe(10);
    expect(hasSocialReach(reach)).toBe(false);
  });

  it('copes with no accounts and no DeHub count', () => {
    expect(computeSocialReach(undefined, null)).toEqual({ dehub: 0, socials: [], total: 0 });
  });
});
