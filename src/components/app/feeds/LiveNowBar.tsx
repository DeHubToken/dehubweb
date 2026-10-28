/**
 * LiveNowBar - One thin row at the top of the home feed for everyone who is
 * live right now: Stage hosts and people livestreaming, side by side.
 *
 * Stacked rippling faces, people you follow first. With one person live the
 * row names their room and a tap goes straight in; with more it reads
 * "Live now" and a tap opens a sheet listing every Stage and stream.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import Users from "@/components/ui/cut-icons/communities";
import Video from "@/components/ui/cut-icons/video";

import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LiveRipple } from '@/components/app/LiveRipple';
import { useAuth } from '@/contexts/AuthContext';
import { useStage, useLiveSpaces } from '@/contexts/StageContext';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { getFollowList } from '@/lib/api/dehub';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';

import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';
import type { SpaceParticipant } from '@/types/audio-spaces.types';

/** One Stage or stream in the row and the sheet. */
export interface LiveNowItem {
  kind: 'stage' | 'stream';
  id: string;
  title: string;
  wallet: string;
  username: string | null;
  /** Stored avatar path for a Stage host, a ready URL for a streamer. */
  avatar: string | null;
  /** Listeners + speakers for a Stage, viewers for a stream (already formatted). */
  count: string;
  /** Someone you follow hosts it, streams it, or is in it. */
  followed: boolean;
  size: number;
}

export function LiveNowBar() {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated } = useAuth();
  const { openModal, joinSpace } = useStage();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  // HomeFeed is kept mounted forever by PersistentPageCache, so the
  // participants poll runs only while home is actually on screen.
  const { pathname } = useLocation();
  const isHomeActive = isHomeFeedRoute(pathname);

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

  // Live stages from StageProvider's single fetch + realtime channel; live
  // streams from the same /api/live query the Live tab and home carousel use.
  const liveStages = useLiveSpaces();
  const { data: liveData } = useDeHubLive(DEFAULT_DEHUB_LIVE_QUERY_OPTIONS);

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
    enabled: stageIds.length > 0 && !!followingData?.length,
    refetchInterval: isHomeActive ? 15_000 : false,
    staleTime: 10_000,
  });

  const items = useMemo(() => {
    const following = new Set(followingData ?? []);
    const me = walletAddress?.toLowerCase();
    const isFollowed = (addr?: string | null) => !!addr && addr.toLowerCase() !== me && following.has(addr.toLowerCase());
    const stagesWithFriends = new Set(
      allParticipants.filter(p => isFollowed(p.wallet_address)).map(p => p.space_id),
    );

    const list: LiveNowItem[] = liveStages.map(stage => {
      const size = (stage.speaker_count || 1) + (stage.listener_count || 0);
      return {
        kind: 'stage',
        id: String(stage.id),
        title: stage.title,
        wallet: stage.host_wallet_address,
        username: stage.host_username,
        avatar: stage.host_avatar,
        count: String(size),
        followed: isFollowed(stage.host_wallet_address) || stagesWithFriends.has(stage.id),
        size,
      };
    });

    const seen = new Set<string>();
    (liveData?.pages ?? []).forEach(page => {
      (page.data || []).forEach((raw, index) => {
        const stream = mapApiLiveStreamToLocal(raw, index);
        const id = String(stream.id);
        if (!stream.isLive || seen.has(id)) return;
        seen.add(id);
        const counts = raw as { totalViews?: number; peakViewers?: number; viewerCount?: number };
        const views = Number(counts.totalViews ?? counts.peakViewers ?? counts.viewerCount ?? 0) || 0;
        list.push({
          kind: 'stream',
          id,
          title: stream.title,
          wallet: String(stream.creatorId ?? ''),
          username: stream.creatorUsername ?? null,
          avatar: stream.avatar || null,
          count: stream.viewers,
          followed: isFollowed(stream.creatorId),
          size: views,
        });
      });
    });

    // People you follow first, then the busiest.
    return list.sort((a, b) => Number(b.followed) - Number(a.followed) || b.size - a.size);
  }, [liveStages, liveData, allParticipants, followingData, walletAddress]);

  const open = (item: LiveNowItem) => {
    setSheetOpen(false);
    if (item.kind === 'stage') {
      // Join the room that was actually tapped, not a generic browse list.
      openModal('live');
      joinSpace(item.id);
    } else {
      navigate(`/app/post/${item.id}`, { state: { fromFeed: true } });
    }
  };

  if (items.length === 0) return null;

  return (
    <>
      <LiveNowRow items={items} onOpen={open} onSeeAll={() => setSheetOpen(true)} />
      {items.length > 1 && (
        <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
          <DrawerContent scrollable column glass className="px-4 pb-6">
            <DrawerHeader className="px-0 pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                {t('stages.liveNow', { defaultValue: 'Live now' })}
              </DrawerTitle>
            </DrawerHeader>
            <LiveNowList items={items} onOpen={open} />
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

/** The single row. Exported so the state gallery can draw it without data. */
export function LiveNowRow({ items, onOpen, onSeeAll }: { items: LiveNowItem[]; onOpen: (item: LiveNowItem) => void; onSeeAll: () => void }) {
  const { t } = useTranslation();
  const single = items.length === 1 ? items[0] : null;
  const names = items.slice(0, 2).map(handleOf);
  const rest = items.length - names.length;

  return (
    <div className="flex flex-col gap-2 mb-2">
      <button
        type="button"
        data-live-now-bar
        onClick={() => (single ? onOpen(single) : onSeeAll())}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] hover:bg-white/[0.08] transition-all group"
      >
        <span className="relative flex h-2 w-2 mx-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>

        <div className="flex -space-x-1 shrink-0">
          {items.slice(0, 4).map(item => (
            <LiveRipple key={`${item.kind}-${item.id}`} live size="sm" className="rounded-lg">
              <LiveFace item={item} />
            </LiveRipple>
          ))}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs text-white/90 truncate">
            <span className="font-medium">{single ? single.title : t('stages.liveNow', { defaultValue: 'Live now' })}</span>
          </p>
          <p className="text-[11px] text-white/50 truncate">
            {single ? (
              single.kind === 'stage' ? (
                <>{t('stages.hostedBy', { defaultValue: 'Hosted by' })} <span className="text-white/70">{handleOf(single)}</span></>
              ) : (
                <span className="text-white/70">{handleOf(single)}</span>
              )
            ) : (
              <>
                <span className="text-white/70">{names.join(', ')}</span>
                {rest > 0 && ` +${rest}`}
              </>
            )}
          </p>
        </div>

        {single ? (
          <LiveCount item={single} />
        ) : (
          <span className="shrink-0 text-[11px] font-medium text-white/60 group-hover:text-white/80">
            {t('stages.seeAll', { defaultValue: 'See all' })} ›
          </span>
        )}
      </button>
    </div>
  );
}

/** The sheet's list: every Stage and stream, one row each. */
export function LiveNowList({ items, onOpen }: { items: LiveNowItem[]; onOpen: (item: LiveNowItem) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <button
          key={`${item.kind}-${item.id}`}
          type="button"
          data-live-now-item={item.kind}
          onClick={() => onOpen(item)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all"
        >
          {item.kind === 'stage' ? (
            <BrandIcon src={stagesMicIcon} alt="" className="w-5 h-5 object-contain shrink-0" />
          ) : (
            <Video className="w-5 h-5 shrink-0 text-white/80" />
          )}
          <LiveRipple live size="sm" className="rounded-lg">
            <LiveFace item={item} className="w-8 h-8" />
          </LiveRipple>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[13px] font-medium text-white/90 truncate">{item.title}</p>
            <p className="text-[11px] text-white/50 truncate">
              {item.kind === 'stage' && <>{t('stages.hostedBy', { defaultValue: 'Hosted by' })} </>}
              <span className="text-white/70">{handleOf(item)}</span>
            </p>
          </div>
          <LiveCount item={item} />
        </button>
      ))}
    </div>
  );
}

function handleOf(item: LiveNowItem): string {
  return `@${item.username || item.wallet?.slice(0, 6) || '?'}`;
}

function LiveCount({ item }: { item: LiveNowItem }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">{t('stages.liveBadge', { defaultValue: 'LIVE' })}</span>
      <span className="flex items-center gap-0.5 text-[10px] text-white/40">
        <Users className="w-3 h-3" />
        {item.count}
      </span>
    </span>
  );
}

function LiveFace({ item, className = 'w-6 h-6' }: { item: LiveNowItem; className?: string }) {
  // Stage hosts carry a stored path (Cloudflare-resized first, then the CDN
  // object); streamers already arrive as a full URL.
  const [failed, setFailed] = useState(false);
  const stored = item.kind === 'stage';
  const resolved = stored ? (item.avatar ? buildAvatarUrl(item.wallet, item.avatar) : undefined) : item.avatar || undefined;
  const fallback = stored ? buildAvatarCdnFallbackUrl(item.wallet, item.avatar ?? undefined) : undefined;
  const src = failed ? fallback : resolved || fallback;

  return (
    <Avatar className={`${className} border border-black/40`}>
      {src && <AvatarImage src={src} onError={() => setFailed(true)} />}
      <AvatarFallback className="bg-white/10 text-white text-[9px]">
        {(item.username || item.wallet || '?')[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
