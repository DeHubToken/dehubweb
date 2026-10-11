import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfileFollowButton, type ProfileFollowProps } from '@/components/app/profile/ProfileFollowButton';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
afterEach(cleanup);
const props = (): ProfileFollowProps => ({
  profile: { name: 'Creator', isFollowing: false, isPending: false } as ProfileFollowProps['profile'],
  apiProfile: undefined, isViewingOwnProfile: false, isFollowing: false, isPending: false,
  isTargetPrivate: false, isFollowLoading: false, handleFollow: vi.fn(), handleUnfollow: vi.fn(),
});
it('uses the existing follow action and prevents duplicate requests', () => {
  const p = props();
  const { rerender } = render(<ProfileFollowButton {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
  expect(p.handleFollow).toHaveBeenCalledTimes(1);
  rerender(<ProfileFollowButton {...p} isFollowLoading />);
  expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled();
  rerender(<ProfileFollowButton {...p} isPending />);
  expect(screen.getByRole('button', { name: 'Requested' })).toBeDisabled();
});
it('keeps unfollow behind confirmation in the compact position', () => {
  const p = props();
  render(<ProfileFollowButton {...p} isFollowing />);
  fireEvent.click(screen.getByRole('button', { name: 'profile.following' }));
  expect(p.handleUnfollow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }));
  expect(p.handleUnfollow).toHaveBeenCalledTimes(1);
});
it.each([{ isViewingOwnProfile: true }, { isBlocked: true }])('omits follow for an ineligible profile %j', state => {
  render(<ProfileFollowButton {...props()} {...state} />);
  expect(screen.queryByRole('button')).toBeNull();
});
