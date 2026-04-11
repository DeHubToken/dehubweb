/**
 * Community Owner Activity
 * ========================
 * Shows join notifications for community owners within the community page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useNavigate } from 'react-router-dom';
import { User, UserPlus, Check, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface CommunityJoinNotification {
  id: string;
  actor_address: string;
  actor_username: string | null;
  actor_avatar: string | null;
  content: string;
  reference_id: string;
  reference_title: string;
  read: boolean;
  created_at: string;
}

function useCommunityJoinNotifications(communityId?: string) {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['community-join-notifications', communityId],
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('*')
          .eq('type', 'community_join')
          .eq('reference_id', communityId!)
          .order('created_at', { ascending: false })
          .limit(50),
        walletAddress!
      );
      if (error) throw error;
      return (data || []) as CommunityJoinNotification[];
    },
    enabled: !!communityId && !!walletAddress,
    staleTime: 60_000,
  });
}

function useMarkCommunityNotificationsRead(communityId?: string) {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .update({ read: true })
          .eq('type', 'community_join')
          .eq('reference_id', communityId!)
          .eq('read', false),
        walletAddress!
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community-join-notifications', communityId] });
      qc.invalidateQueries({ queryKey: ['community-activity-unread-per'] });
      qc.invalidateQueries({ queryKey: ['community-activity-unread'] });
    },
  });
}

function ActivityRow({ notification }: { notification: CommunityJoinNotification }) {
  const navigate = useNavigate();
  const { data: profile } = useDeHubProfile({ userId: notification.actor_address });

  const displayName = profile?.name || `${notification.actor_address.slice(0, 6)}...${notification.actor_address.slice(-4)}`;
  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl || notification.actor_avatar;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <button
      onClick={() => {
        if (handle) navigate(`/${handle.replace('@', '')}`);
      }}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center border border-black/40">
          <UserPlus className="w-2.5 h-2.5 text-green-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm font-medium truncate">{displayName}</span>
          {!notification.read && (
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
          )}
        </div>
        <span className="text-zinc-500 text-xs">{notification.content} · {timeAgo}</span>
      </div>
    </button>
  );
}

interface CommunityOwnerActivityProps {
  communityId: string;
}

export function CommunityOwnerActivity({ communityId }: CommunityOwnerActivityProps) {
  const { data: notifications = [], isLoading } = useCommunityJoinNotifications(communityId);
  const markReadMutation = useMarkCommunityNotificationsRead(communityId);
  const { t } = useTranslation();

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm">No activity yet</p>
        <p className="text-zinc-600 text-xs mt-1">You'll be notified when someone joins your community</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs text-zinc-400">{unreadCount} new</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markReadMutation.mutate()}
            disabled={markReadMutation.isPending}
            className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white"
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        </div>
      )}
      {notifications.map(notification => (
        <ActivityRow key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
