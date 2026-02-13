import { useState } from 'react';
import { toast } from 'sonner';
import { followUser, unfollowUser } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';

interface UseProfileFollowParams {
  profile: ProfileData | undefined;
  isAuthenticated: boolean;
  isTargetPrivate: boolean;
  setFollowStatus: (status: boolean) => void;
  handleApiError: (error: unknown, fallbackMessage: string) => void;
  setShareSheetOpen: (open: boolean) => void;
  setLoginModalOpen: (open: boolean) => void;
}

export function useProfileFollow({
  profile,
  isAuthenticated,
  isTargetPrivate,
  setFollowStatus,
  handleApiError,
  setShareSheetOpen,
  setLoginModalOpen,
}: UseProfileFollowParams) {
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const handleFollow = async () => {
    if (!isAuthenticated) {
      setLoginModalOpen(true);
      return;
    }

    if (!profile?.walletAddress) {
      toast.error('Cannot follow: user wallet address not found');
      return;
    }

    setIsFollowLoading(true);

    // For private accounts, the follow becomes a request
    if (isTargetPrivate) {
      setFollowStatus(true); // will show as pending via isPending
    } else {
      setFollowStatus(true);
    }

    try {
      await followUser(profile.walletAddress);
      if (isTargetPrivate) {
        toast.success(`Follow request sent to ${profile.name}`);
      } else {
        toast.success(`Following ${profile.name}`);
      }
    } catch (error) {
      setFollowStatus(false);
      handleApiError(error, 'Failed to follow. Please try again.');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!profile?.walletAddress) {
      toast.error('Cannot unfollow: user wallet address not found');
      return;
    }

    setIsFollowLoading(true);
    setFollowStatus(false);

    try {
      await unfollowUser(profile.walletAddress);
      toast.success(`Unfollowed ${profile.name}`);
    } catch (error) {
      setFollowStatus(true);
      handleApiError(error, 'Failed to unfollow. Please try again.');
    } finally {
      setIsFollowLoading(false);
      setShareSheetOpen(false);
    }
  };

  return {
    isFollowLoading,
    handleFollow,
    handleUnfollow,
  };
}
