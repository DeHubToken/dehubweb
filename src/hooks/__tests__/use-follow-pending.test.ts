import { expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { toggleFollowFor, getFollowOverride } from '../use-follow';
const api = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }));
vi.mock('@/lib/api/dehub', () => api);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (key: string) => key }));

it.each(['response', 'conflict'])('does not leave a private request counted as a follower (%s)', async mode => {
  const client = new QueryClient();
  const address = `private-${mode}`;
  client.setQueryData(['dehub-profile', address], { walletAddress: address, followers: 8, isFollowing: false });
  if (mode === 'response') api.followUser.mockResolvedValue({ result: true, status: 'pending' });
  else api.followUser.mockRejectedValue(new Error('Follow request already pending'));
  const onSuccess = vi.fn();
  await expect(toggleFollowFor(client, address, false, { onSuccess })).resolves.toBe(true);
  expect(getFollowOverride(address)).toBeUndefined();
  expect(client.getQueryData(['dehub-profile', address])).toMatchObject({ followers: 8, isFollowing: false });
  expect(onSuccess).toHaveBeenCalledWith(false);
});
