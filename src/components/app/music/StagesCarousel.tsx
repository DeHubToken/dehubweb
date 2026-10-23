import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Stages Carousel for Music Feed
 * ===============================
 * Displays live audio stages in a horizontal carousel.
 *
 * Nothing live is the usual state, and an empty "start a stage" prompt made
 * the whole section read as dead. So with no live rooms the carousel falls
 * back to recorded ones — the same PastStageCard the /stages page shows,
 * carrying its own inline player, so the section is something to listen to
 * rather than an advert for a feature nobody is using. The create prompt is
 * only what's left when there is no audio at all.
 *
 * @module components/app/music/StagesCarousel
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { Mic2 } from "lucide-react";
import Users from "@/components/ui/cut-icons/communities";

import ChevronRight from "@/components/ui/cut-icons/next";
import Plus from "@/components/ui/cut-icons/add";

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useLiveSpaces, useScheduledSpaces, useStage } from '@/contexts/StageContext';
import { ChartDesk } from '@/components/app/music/ChartDesk';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { StageHostLink } from '@/components/app/stages/StageHostLink';
import { PastStageCard } from '@/components/app/stages/PastStageCard';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { BadgedName } from '@/components/app/BadgedName';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace } from '@/types/audio-spaces.types';

// Import the 3D mic icon
import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';

interface StagesCarouselProps {
  onOpenStages: () => void;
}

function StageCard({ space, onClick, wide = false }: { space: AudioSpace; onClick: () => void; wide?: boolean }) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const totalListeners = (space.speaker_count || 1) + (space.listener_count || 0);
  // With no host_avatar the CDN URL is a guess that 403s for hosts who never
  // uploaded one — drop to the initial instead of a broken image.
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatar = avatarFailed
    ? undefined
    : buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
      buildAvatarCdnFallbackUrl(space.host_wallet_address || '');

  return (
    <button
      onClick={onClick}
      className={cn(wide ? 'w-full' : 'flex-shrink-0 w-[260px] self-start', 'rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden text-left hover:border-white/20 transition-all group')}
    >
      {/* The host's cover, or the stage's generated poster when there is none. */}
      <StageCoverArt src={space.cover_image_url} title={space.title} stage={space} />
      <div className="p-3">
      {/* Live badge and listeners */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 rounded-lg">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 text-xs font-medium">{_copy("copy.35e0d0360a0a", { defaultValue: "LIVE" })}</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{totalListeners}</span>
        </div>
      </div>
      
      {/* Host info — backlinks to the host's profile */}
      <div className="flex items-center gap-3 mb-3">
        <StageHostLink
          space={space}
          avatarUrl={avatar || undefined}
          nested
          className="group/host flex items-center gap-3 min-w-0 flex-1"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-lg ring-2 ring-white/20 overflow-hidden">
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
              ) : (
                <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white font-medium text-sm">
                  {(space.host_username || space.host_wallet_address || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center">
              <Mic2 className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-zinc-500 text-[10px]">{t('stages.hostedBy')}</p>
            <BadgedName
              lookupId={space.host_username || space.host_wallet_address}
              className="text-white text-xs font-medium group-hover/host:underline"
            >
              @{space.host_username || space.host_wallet_address?.slice(0, 6)}
            </BadgedName>
          </div>
        </StageHostLink>
      </div>
      
      {/* Title */}
      <h4 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-zinc-300 transition-colors">
        {space.title}
      </h4>
      
      {/* Description if available */}
      {space.description && (
        <p className="text-zinc-500 text-xs mt-1 line-clamp-1">
          {space.description}
        </p>
      )}
      </div>
    </button>
  );
}

export function StagesCarousel({ onOpenStages }: StagesCarouselProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { openModal, joinSpace } = useStage();

  // Join the specific stage a card was clicked for, rather than opening the
  // generic browse list — the card already names one live room.
  const handleJoinStage = (spaceId: string) => {
    openModal('live');
    joinSpace(spaceId);
  };

  // Live stages — shared from StageProvider's single fetch + realtime channel
  // (this component previously ran its own query AND two realtime
  // subscriptions against audio_spaces; the provider's debounced refresh
  // covers insert/update/end within ~1s).
  const liveSpaces = useLiveSpaces();

  // Recorded rooms, fetched only once we know there is nothing live to show
  // instead. Shares the ['past-stages'] key with the /stages page, so opening
  // "See all" from here does not refetch what this carousel already has.
  const { data: pastSpaces = [] } = useQuery({
    queryKey: ['past-stages'],
    enabled: liveSpaces.length === 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'ended')
        .order('ended_at', { ascending: false })
        .limit(20);
      return (data as AudioSpace[]) || [];
    },
    staleTime: 5 * 60_000,
  });

  const showPast = liveSpaces.length === 0 && pastSpaces.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-white flex items-center gap-2">
          <BrandIcon src={stagesMicIcon} alt="" className="w-5 h-5 object-contain" />{_copy("copy.3a17aa4e4abb", { defaultValue: "Stages" })}{liveSpaces.length > 0 ? (
            <span className="text-zinc-500 font-normal text-sm">({liveSpaces.length})</span>
          ) : showPast ? (
            <span className="text-zinc-500 font-normal text-sm">{_copy("copy.c7175fa7a0db", { defaultValue: "Recorded" })}</span>
          ) : null}
        </h2>
        <button 
          onClick={onOpenStages}
          className="text-zinc-400 text-sm hover:text-white flex items-center gap-1"
        >{_copy("copy.14c21c5e3ffe", { defaultValue: "See all " })}<ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      {/* Carousel */}
      {showPast ? (
        <div className="relative">
          <SwipeableCarousel fadeEdges className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
            {pastSpaces.slice(0, 10).map((space) => (
              <PastStageCard
                key={space.id}
                space={space}
                className="flex-shrink-0 w-[260px] self-start"
              />
            ))}
          </SwipeableCarousel>
        </div>
      ) : liveSpaces.length === 0 ? (
        <button
          onClick={onOpenStages}
          className="w-full flex items-center gap-3 p-4 bg-zinc-800/60 border border-dashed border-white/10 rounded-2xl hover:border-white/20 hover:bg-zinc-800/80 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-zinc-700/60 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
            <Plus className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
          </div>
          <div className="text-left">
            <p className="text-white text-sm font-medium">{_copy("copy.3b59e95daada", { defaultValue: "No live stages right now" })}</p>
            <p className="text-zinc-500 text-xs">{_copy("copy.c88e9158a85f", { defaultValue: "Start a stage and go live with your audience" })}</p>
          </div>
        </button>
      ) : (
        <div className="relative">
          <SwipeableCarousel fadeEdges className="flex gap-3 overflow-x-auto scrollbar-hide pr-8">
            {liveSpaces.map((space) => (
              <StageCard
                key={space.id}
                space={space}
                onClick={() => handleJoinStage(space.id)}
              />
            ))}
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

type StagesChartSort = 'live' | 'upcoming' | 'listened' | 'recent';

/** Ended stages for the chart, ranked by listens or by when they ended. */
function usePastStages(order: 'total_listens' | 'ended_at', enabled: boolean) {
  return useQuery({
    // 'recent' shares ['past-stages'] with the /stages page and the carousel.
    queryKey: order === 'ended_at' ? ['past-stages'] : ['past-stages', order],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('status', 'ended')
        .order(order, { ascending: false, nullsFirst: false })
        .limit(20);
      return (data as AudioSpace[]) || [];
    },
    staleTime: 5 * 60_000,
  });
}

function UpcomingStagePanel({ space }: { space: AudioSpace }) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const when = space.scheduled_at ? new Date(space.scheduled_at) : null;
  return (
    <button
      type="button"
      onClick={() => navigate(space.short_id != null ? `/stages/${space.short_id}` : `/stage/${space.id}`)}
      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden text-left hover:bg-white/[0.06] transition-colors"
    >
      <StageCoverArt src={space.cover_image_url} title={space.title} stage={space} />
      <div className="p-3 space-y-1">
        <p className="text-zinc-400 text-[11px] font-medium">
          {_copy('music.upcoming', { defaultValue: 'Upcoming' })}
          {when && ` · ${when.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </p>
        <h4 className="text-white font-semibold text-sm line-clamp-2">{space.title}</h4>
      </div>
    </button>
  );
}

/**
 * Stages as a chart, like the audio chart above it: Live now, Upcoming, Most
 * listened and Recent, the picked stage up front and the list beside it.
 */
export function StagesChart(_props: StagesCarouselProps) {
  const { t: _copy } = _useCopy();
  const { openModal, joinSpace } = useStage();
  const liveSpaces = useLiveSpaces();
  const scheduledSpaces = useScheduledSpaces();
  // Open on whatever is happening: live rooms first, else what is coming up,
  // else the most listened recordings.
  const [chosen, setChosen] = useState<StagesChartSort | null>(null);
  const sort: StagesChartSort = chosen ?? (liveSpaces.length ? 'live' : scheduledSpaces.length ? 'upcoming' : 'listened');
  const listened = usePastStages('total_listens', sort === 'listened');
  const recent = usePastStages('ended_at', sort === 'recent');

  const spaces = sort === 'live' ? liveSpaces
    : sort === 'upcoming' ? scheduledSpaces
    : sort === 'listened' ? listened.data || []
    : recent.data || [];
  const isLoading = sort === 'listened' ? listened.isLoading : sort === 'recent' ? recent.isLoading : false;

  const subtitle = (space: AudioSpace) => {
    const host = space.host_username ? `@${space.host_username}` : space.host_wallet_address?.slice(0, 6) || '';
    if (sort === 'live') return `${host} · ${(space.speaker_count || 1) + (space.listener_count || 0)} ${_copy('music.listening', { defaultValue: 'listening' })}`;
    if (sort === 'upcoming' && space.scheduled_at) return `${host} · ${new Date(space.scheduled_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    return space.total_listens ? `${host} · ${space.total_listens} ${_copy('music.listens', { defaultValue: 'listens' })}` : host;
  };

  return (
    <ChartDesk
      header={
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white flex items-center gap-2">
            <BrandIcon src={stagesMicIcon} alt="" className="w-5 h-5 object-contain" />{_copy("copy.3a17aa4e4abb", { defaultValue: "Stages" })}
            {liveSpaces.length > 0 && <span className="text-zinc-500 font-normal text-sm">({liveSpaces.length} {_copy('music.liveCount', { defaultValue: 'live' })})</span>}
          </h2>
        </div>
      }
      sorts={[
        { value: 'live', label: _copy('music.stagesLive', { defaultValue: 'Live now' }) },
        { value: 'upcoming', label: _copy('music.upcoming', { defaultValue: 'Upcoming' }) },
        { value: 'listened', label: _copy('music.mostListened', { defaultValue: 'Most listened' }) },
        { value: 'recent', label: _copy('music.recentStages', { defaultValue: 'Recent' }) },
      ]}
      sort={sort}
      onSort={setChosen}
      sortLabel={_copy('music.stagesChartOrder', { defaultValue: 'Stages chart order' })}
      rows={spaces.map(space => ({
        id: space.id,
        title: space.title,
        subtitle: subtitle(space),
        thumb: space.cover_image_url || undefined,
      }))}
      isLoading={isLoading}
      thumbs="wide"
      empty={{ icon: 'stages', title: sort === 'live' ? _copy("copy.3b59e95daada", { defaultValue: "No live stages right now" }) : _copy('music.noStages', { defaultValue: 'No stages here yet' }) }}
      renderSelected={id => {
        const space = spaces.find(s => s.id === id);
        if (!space) return null;
        if (sort === 'live') return <StageCard space={space} onClick={() => { openModal('live'); joinSpace(space.id); }} wide />;
        if (sort === 'upcoming') return <UpcomingStagePanel space={space} />;
        return <PastStageCard key={space.id} space={space} />;
      }}
    />
  );
}

export default StagesCarousel;
