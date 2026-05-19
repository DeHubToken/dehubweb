/**
 * Community Owner Activity
 * ========================
 * Shows join notifications for community owners within the community page.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useNavigate } from 'react-router-dom';
import { User, UserPlus, Check, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
          .limit(200),
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
  const { data: profile, isLoading: profileLoading } = useDeHubProfile({ userId: notification.actor_address });

  const handle = profile?.handle;
  const avatarUrl = profile?.avatarUrl || notification.actor_avatar;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  // Don't show wallet address — show skeleton while profile loads, then real name
  const hasName = !!profile?.name;
  const displayName = profile?.name;

  return (
    <button
      onClick={() => {
        if (handle) navigate(`/${handle.replace('@', '')}`);
      }}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : profileLoading ? (
          <div className="w-full h-full animate-pulse bg-white/[0.08]" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md bg-green-500/20 flex items-center justify-center border border-black/40">
          <UserPlus className="w-2.5 h-2.5 text-green-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {hasName ? (
            <span className="text-white text-sm font-medium truncate">{displayName}</span>
          ) : (
            <span className="h-3.5 w-28 rounded bg-white/[0.08] animate-pulse" />
          )}
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

const PAGE_SIZE = 20;

export function CommunityOwnerActivity({ communityId }: CommunityOwnerActivityProps) {
  const { data: notifications = [], isLoading } = useCommunityJoinNotifications(communityId);
  const markReadMutation = useMarkCommunityNotificationsRead(communityId);
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter(n =>
      (n.actor_username || '').toLowerCase().includes(q) ||
      n.actor_address.toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q)
    );
  }, [notifications, query]);

  const shown = filtered.slice(0, visible);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-3 w-48 rounded bg-white/[0.04] animate-pulse" />
            </div>
          </div>
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
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
          placeholder="Search members..."
          className="pl-9 h-9 bg-white/[0.04] border-white/10 text-sm rounded-lg"
        />
      </div>

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

      {shown.map(notification => (
        <ActivityRow key={notification.id} notification={notification} />
      ))}

      {filtered.length > visible && (
        <Button
          variant="ghost"
          onClick={() => setVisible(v => v + PAGE_SIZE)}
          className="w-full h-9 text-xs text-zinc-400 hover:text-white rounded-lg"
        >
          Show more ({filtered.length - visible})
        </Button>
      )}

      {filtered.length === 0 && query && (
        <p className="text-center text-xs text-zinc-500 py-6">No matches for "{query}"</p>
      )}
    </div>
  );
}
