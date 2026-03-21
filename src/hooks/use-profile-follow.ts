import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const invalidateProfileQueries = () => {
    if (!profile?.walletAddress) return;
    // Invalidate all profile queries for this user so any cached isFollowing is refreshed
    queryClient.invalidateQueries({
      queryKey: ['dehub-profile'],
      predicate: (query) => {
        const key = query.queryKey;
        // Match queries where the userId/username matches this profile
        return key[0] === 'dehub-profile' && (
          key[1] === profile.walletAddress ||
          key[1] === profile.handle?.replace('@', '')
        );
      },
    });
  };

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
      invalidateProfileQueries();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('following')) {
        toast.info(`Already following ${profile.name}`);
        // Keep follow state as true since they're already following
      } else {
        setFollowStatus(false);
        handleApiError(error, 'Failed to follow. Please try again.');
      }
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in first');
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
      invalidateProfileQueries();
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
