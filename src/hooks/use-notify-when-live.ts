/**
 * "Notify when live" on a stream's menu.
 *
 * Followers already get a notification when a creator goes live (the backend's
 * `livestream_start`), so switching the alert on IS following them — there is
 * no separate per-creator setting to store. Someone who already follows is
 * told so instead of being followed twice.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getFollowStatus } from '@/lib/api/dehub';
import { getFollowOverride, toggleFollowFor } from '@/hooks/use-follow';

export function useNotifyWhenLive() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();

  return useCallback(async (creatorAddress?: string | null, creatorName?: string | null) => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!creatorAddress) return;
    const name = creatorName || t('copy.c48cabf53e9c', 'this creator');

    let following = getFollowOverride(creatorAddress);
    if (following === undefined) {
      following = await getFollowStatus(creatorAddress).then(status => status.isFollowing).catch(() => false);
    }
    if (following) {
      toast.success(t('postOptions.liveAlertsAlreadyOn', { name, defaultValue: "You follow {{name}}, so you'll get a notification when they go live." }));
      return;
    }
    const followed = await toggleFollowFor(queryClient, creatorAddress, false, { silent: true, name });
    if (followed) {
      toast.success(t('postOptions.liveAlertsOn', { name, defaultValue: "Following {{name}}. You'll get a notification when they go live." }));
    }
  }, [walletAddress, openLoginModal, queryClient, t]);
}
