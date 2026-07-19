/**
 * FriendsOnStageBar - Shows when people you follow are in a live Stage
 * Thin notification bar at top of home feed.
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';
import { getFollowList } from '@/lib/api/dehub';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';

import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import type { AudioSpace, SpaceParticipant } from '@/types/audio-spaces.types';

interface FriendOnStage {
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  role: string;
  stage: AudioSpace;
}

const HOME_PATHS = new Set(['/', '/app', '/videos', '/shorts']);

export function FriendsOnStageBar() {
  const { walletAddress, isAuthenticated } = useAuth();
  const { openModal } = useStage();
  // This bar lives in HomeFeed, which PersistentPageCache keeps mounted
  // forever — without a route gate these two polls run every 15s for the
  // whole session on every page. Poll only while home is actually on screen.
  const { pathname } = useLocation();
  const isHomeActive = HOME_PATHS.has(pathname);

  // Fetch user's following list
  const { data: followingData } = useQuery({
    queryKey: ['following-list-for-stages', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const { items } = await getFollowList(walletAddress, 'following', { limit: 3000 });
      return items.map(i => i.address?.toLowerCase()).filter(Boolean) as string[];
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch live stages
  const { data: liveStages = [] } = useQuery({
    queryKey: ['live-stages-for-bar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'live')
        .order('started_at', { ascending: false });
      return (data as AudioSpace[]) || [];
    },
    refetchInterval: isHomeActive ? 15_000 : false,
    staleTime: 10_000,
  });

  // Fetch participants for live stages
  const stageIds = liveStages.map(s => s.id);
  const { data: allParticipants = [] } = useQuery({
    queryKey: ['stage-participants-for-bar', stageIds],
    queryFn: async () => {
      if (stageIds.length === 0) return [];
      const { data } = await supabase
        .from('space_participants')
        .select('*')
        .in('space_id', stageIds)
        .is('left_at', null);
      return (data as SpaceParticipant[]) || [];
    },
    enabled: stageIds.length > 0,
    refetchInterval: isHomeActive ? 15_000 : false,
    staleTime: 10_000,
  });

  // Cross-reference: find followed users in live stages
  const friendsOnStage = useMemo((): FriendOnStage[] => {
    if (!followingData || followingData.length === 0 || liveStages.length === 0) return [];
    const followingSet = new Set(followingData);
    const results: FriendOnStage[] = [];

    for (const participant of allParticipants) {
      const addr = participant.wallet_address?.toLowerCase();
      if (!addr || addr === walletAddress?.toLowerCase()) continue;
      if (followingSet.has(addr)) {
        const stage = liveStages.find(s => s.id === participant.space_id);
        if (stage) {
          results.push({
            wallet_address: addr,
            username: participant.username,
            avatar: participant.avatar,
            role: participant.role,
            stage,
          });
        }
      }
    }
    return results;
  }, [followingData, allParticipants, liveStages, walletAddress]);

  // Group by stage
  const stageGroups = useMemo(() => {
    const map = new Map<string, { stage: AudioSpace; friends: FriendOnStage[] }>();
    for (const f of friendsOnStage) {
      const existing = map.get(f.stage.id);
      if (existing) {
        existing.friends.push(f);
      } else {
        map.set(f.stage.id, { stage: f.stage, friends: [f] });
      }
    }
    return Array.from(map.values());
  }, [friendsOnStage]);

  // Show first stage group (most relevant)
  const primary = stageGroups[0];
  const hostFriend = primary?.friends.find(f => f.role === 'host');
  const otherFriends = primary?.friends.filter(f => f !== hostFriend) ?? [];

  if (friendsOnStage.length === 0) return null;

  return (
    <>
    {<button
      onClick={() => openModal('browse')}
      className="w-full flex items-center gap-2.5 px-3 py-2 mb-2 rounded-xl bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] hover:bg-white/[0.08] transition-all group"
    >
      {/* Stage mic icon */}
      <img src={stagesMicIcon} alt="" className="w-5 h-5 object-contain shrink-0" />

      {/* Host avatar */}
      <div className="flex -space-x-1.5 shrink-0">
        <StageBarAvatar
          wallet={primary.stage.host_wallet_address}
          avatar={primary.stage.host_avatar}
          username={primary.stage.host_username}
        />
        {otherFriends.slice(0, 3).map(f => (
          <StageBarAvatar
            key={f.wallet_address}
            wallet={f.wallet_address}
            avatar={f.avatar}
            username={f.username}
          />
        ))}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs text-white/90 truncate">
          <span className="font-medium">{primary.stage.title}</span>
        </p>
        <p className="text-[11px] text-white/50 truncate">
          {hostFriend ? (
            <>
              <span className="text-white/70">{hostFriend.username || 'Someone you follow'}</span>
              {' is hosting'}
              {otherFriends.length > 0 && (
                <> · {otherFriends.length} more {otherFriends.length === 1 ? 'friend' : 'friends'} listening</>
              )}
            </>
          ) : (
            <>
              <span className="text-white/70">
                {otherFriends.slice(0, 2).map(f => f.username || 'Friend').join(', ')}
              </span>
              {otherFriends.length > 2 && ` +${otherFriends.length - 2}`}
              {' listening'}
            </>
          )}
        </p>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Live</span>
      </div>
    </button>}
    </>
  );
}

function StageBarAvatar({ wallet, avatar, username }: { wallet: string; avatar: string | null; username: string | null }) {
  const resolved = avatar ? buildAvatarUrl(wallet, avatar) : undefined;
  const fallback = buildAvatarCdnFallbackUrl(wallet, avatar ?? undefined);

  return (
    <Avatar className="w-6 h-6 border border-black/40">
      <AvatarImage
        src={resolved || fallback}
        onError={(e) => {
          if (fallback && (e.target as HTMLImageElement).src !== fallback) {
            (e.target as HTMLImageElement).src = fallback;
          }
        }}
      />
      <AvatarFallback className="bg-white/10 text-white text-[9px]">
        {username?.[0]?.toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  );
}
