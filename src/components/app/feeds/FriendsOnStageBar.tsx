import { useTranslation as _useCopy } from 'react-i18next';
/**
 * FriendsOnStageBar - One thin row per live Stage at the top of the home
 * feed, for everyone. Rows with people you follow come first and name them.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useStage, useLiveSpaces } from '@/contexts/StageContext';
import { getFollowList } from '@/lib/api/dehub';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';

import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';
import type { AudioSpace, SpaceParticipant } from '@/types/audio-spaces.types';

interface FriendOnStage {
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  role: string;
  stage: AudioSpace;
}


export function FriendsOnStageBar() {
  const { t: _copy } = _useCopy();
  const { walletAddress, isAuthenticated } = useAuth();
  const { openModal, joinSpace } = useStage();
  const { t } = useTranslation();
  // This bar lives in HomeFeed, which PersistentPageCache keeps mounted
  // forever — without a route gate these two polls run every 15s for the
  // whole session on every page. Poll only while home is actually on screen.
  const { pathname } = useLocation();
  const isHomeActive = isHomeFeedRoute(pathname);

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

  // Live stages — shared from StageProvider's single fetch + realtime channel
  // (was a duplicate 15s Supabase poll of the same table).
  const liveStages = useLiveSpaces();

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

  // Every live stage is public, so every one gets a row for everyone —
  // rooms with people you follow first, then the busiest.
  const rows = useMemo(() => {
    const size = (s: AudioSpace) => (s.speaker_count || 1) + (s.listener_count || 0);
    const friendsBy = new Map(stageGroups.map(g => [g.stage.id, g.friends]));
    return [...liveStages]
      .map(stage => ({ stage, friends: friendsBy.get(stage.id) ?? [] }))
      .sort((x, y) => (y.friends.length > 0 ? 1 : 0) - (x.friends.length > 0 ? 1 : 0) || size(y.stage) - size(x.stage));
  }, [liveStages, stageGroups]);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-2">
      {rows.map(({ stage, friends }) => {
        const hostFriend = friends.find(f => f.role === 'host');
        const otherFriends = friends.filter(f => f !== hostFriend);
        const totalListeners = (stage.speaker_count || 1) + (stage.listener_count || 0);
        return (
    <button
      key={stage.id}
      onClick={() => {
        // Join the stage that was actually tapped, not a generic browse list
        // — the bar already names one specific room.
        openModal('live');
        joinSpace(stage.id);
      }}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] hover:bg-white/[0.08] transition-all group"
    >
      {/* Stage mic icon */}
      <BrandIcon src={stagesMicIcon} alt="" className="w-5 h-5 object-contain shrink-0" />

      {/* Host avatar */}
      <div className="flex -space-x-1.5 shrink-0">
        <StageBarAvatar
          wallet={stage.host_wallet_address}
          avatar={stage.host_avatar}
          username={stage.host_username}
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
          <span className="font-medium">{stage.title}</span>
        </p>
        <p className="text-[11px] text-white/50 truncate">
          {friends.length === 0 ? (
            <>
              {t('stages.hostedBy')}{' '}
              <span className="text-white/70">@{stage.host_username || stage.host_wallet_address?.slice(0, 6)}</span>
            </>
          ) : hostFriend ? (
            <>
              <span className="text-white/70">{hostFriend.username || _copy("copy.af1eb1f0e905", { defaultValue: "Someone you follow" })}</span>
              {_copy("copy.987710b190c7", { defaultValue: " is hosting" })}
              {otherFriends.length > 0 && (
                <> · {otherFriends.length}{_copy("copy.ca1231ab640a", { defaultValue: " more " })}{otherFriends.length === 1 ? _copy("copy.cde48537ca2c", { defaultValue: "friend" }) : _copy("copy.2e4b9cc2428b", { defaultValue: "friends" })}{_copy("copy.bd810aa1cb03", { defaultValue: " listening" })}</>
              )}
            </>
          ) : (
            <>
              <span className="text-white/70">
                {otherFriends.slice(0, 2).map(f => f.username || _copy("copy.acd8f6644016", { defaultValue: "Friend" })).join(', ')}
              </span>
              {otherFriends.length > 2 && ` +${otherFriends.length - 2}`}
              {_copy("copy.bd810aa1cb03", { defaultValue: " listening" })}
            </>
          )}
        </p>
      </div>

      {/* Live indicator + listener count */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">{t('stages.tabLive')}</span>
        <span className="flex items-center gap-0.5 text-[10px] text-white/40">
          <Users className="w-3 h-3" />
          {totalListeners}
        </span>
      </div>
    </button>
        );
      })}
    </div>
  );
}

function StageBarAvatar({ wallet, avatar, username }: { wallet: string; avatar: string | null; username: string | null }) {
  // Two rungs that cannot share a failure mode: the Cloudflare-resized URL
  // first, the CDN object itself if that fails.
  const [failed, setFailed] = useState(false);
  const resolved = avatar ? buildAvatarUrl(wallet, avatar) : undefined;
  const fallback = buildAvatarCdnFallbackUrl(wallet, avatar ?? undefined);
  const activeSrc = failed ? fallback : resolved || fallback;

  return (
    <Avatar className="w-6 h-6 border border-black/40">
      {activeSrc && <AvatarImage src={activeSrc} onError={() => setFailed(true)} />}
      <AvatarFallback className="bg-white/10 text-white text-[9px]">
        {username?.[0]?.toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  );
}
