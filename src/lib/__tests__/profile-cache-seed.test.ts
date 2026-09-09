import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { seedProfileCache } from '@/lib/profile-cache-seed';

describe('seedProfileCache', () => {
  it('keeps notification counts and an explicit false relationship for first paint', () => {
    const client = new QueryClient();

    seedProfileCache(client, {
      address: '0xactor',
      username: 'actor',
      displayName: 'Actor',
      followers: 0,
      following: 14,
      isFollowing: false,
      followsYou: true,
      isPending: false,
    }, '0xviewer');

    expect(client.getQueryData(['dehub-profile', 'actor', '0xviewer'])).toMatchObject({
      walletAddress: '0xactor',
      followers: 0,
      following: 14,
      isFollowing: false,
      followsYou: true,
      isPending: false,
    });
  });

  it('keys address-only notifications the same way as the profile route', () => {
    const client = new QueryClient();

    seedProfileCache(client, {
      address: '0xactor',
      followers: 3,
    });

    expect(client.getQueryData(['dehub-profile', '0xactor', undefined])).toMatchObject({
      walletAddress: '0xactor',
      followers: 3,
    });
  });
});
