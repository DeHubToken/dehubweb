import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/api/dehub';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';

/**
 * Follow visibility modes stored in DeHub API customs.followVisibility:
 * - 'public'      → numbers visible AND clickable (lists accessible)
 * - 'counts-only' → numbers visible but NOT clickable
 * - 'hidden'      → numbers completely hidden from visitors
 */
export type FollowVisibility = 'public' | 'counts-only' | 'hidden';

/**
 * Derive boolean flags from a single followVisibility string.
 */
function parseVisibility(raw?: unknown): { showFollowersFollowing: boolean; hideFollowerCounts: boolean } {
  const value = (typeof raw === 'string' ? raw : 'public') as FollowVisibility;

  switch (value) {
    case 'hidden':
      return { showFollowersFollowing: false, hideFollowerCounts: true };
    case 'counts-only':
      return { showFollowersFollowing: false, hideFollowerCounts: false };
    case 'public':
    default:
      return { showFollowersFollowing: true, hideFollowerCounts: false };
  }
}

/**
 * Hook to manage the current user's privacy settings via the DeHub API customs field.
 */
export function usePrivacySettings() {
  const { user, walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Read current profile (customs) from the existing profile query
  const { data: profile } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress && isAuthenticated,
  });

  const customs = profile?.customs;
  const { showFollowersFollowing, hideFollowerCounts } = parseVisibility(customs?.followVisibility);
  const isPrivate = customs?.isPrivate === 'true' || customs?.isPrivate === true;

  const updateMutation = useMutation({
    mutationFn: async (updates: {
      show_followers_following?: boolean;
      hide_follower_counts?: boolean;
      default_post_visibility?: 'public' | 'private';
      is_private?: boolean;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const profileUpdate: Record<string, any> = {};

      // Use direct API fields for hideFollowers and isPrivate
      if (updates.hide_follower_counts !== undefined || updates.show_followers_following !== undefined) {
        // hideFollowers = true when visibility is 'hidden'
        const hideFollowers = updates.hide_follower_counts === true || updates.show_followers_following === false;
        profileUpdate.hideFollowers = hideFollowers;
      }

      if (updates.is_private !== undefined) {
        profileUpdate.isPrivate = updates.is_private;
      }

      // Keep customs for follow visibility granularity and default post visibility
      const customsUpdates: Record<string, string> = {};
      if (updates.show_followers_following !== undefined || updates.hide_follower_counts !== undefined) {
        let visibility: FollowVisibility;
        if (updates.hide_follower_counts) {
          visibility = 'hidden';
        } else if (updates.show_followers_following === false) {
          visibility = 'counts-only';
        } else {
          visibility = 'public';
        }
        customsUpdates.followVisibility = visibility;
      }
      if (updates.default_post_visibility !== undefined) {
        customsUpdates.defaultPostVisibility = updates.default_post_visibility;
      }

      if (Object.keys(customsUpdates).length > 0) {
        const existingCustoms = (customs ?? {}) as Record<string, string>;
        profileUpdate.customs = { ...existingCustoms, ...customsUpdates };
      }

      await updateProfile(profileUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      toast.success('Privacy settings updated');
    },
    onError: (error) => {
      console.error('Failed to update privacy settings:', error);
      toast.error('Failed to update settings');
    },
  });

  const updateSettings = (updates: {
    show_followers_following?: boolean;
    hide_follower_counts?: boolean;
    default_post_visibility?: 'public' | 'private';
    is_private?: boolean;
  }) => {
    updateMutation.mutate(updates);
  };

  return {
    settings: null, // kept for interface compat
    isLoading: false,
    showFollowersFollowing,
    hideFollowerCounts,
    isPrivate,
    defaultPostVisibility: (customs?.defaultPostVisibility as 'public' | 'private') ?? 'public',
    updateSettings,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook to check another user's privacy settings (for profile pages).
 * Reads from the customs field already present on the profile query.
 */
export function useUserPrivacySettings(walletAddress?: string) {
  const { data: profile } = useDeHubProfile({
    userId: walletAddress,
    enabled: !!walletAddress,
  });

  const customs = profile?.customs;
  const { showFollowersFollowing, hideFollowerCounts } = parseVisibility(customs?.followVisibility);

  return {
    settings: null,
    isLoading: false,
    showFollowersFollowing,
    hideFollowerCounts,
    defaultPostVisibility: (customs?.defaultPostVisibility as 'public' | 'private') ?? 'public',
  };
}
