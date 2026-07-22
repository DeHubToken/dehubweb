/**
 * Stages Page
 * ===========
 * Dedicated /stages hub for live audio rooms ("Stages"). Discovery lives here;
 * the live / create experience stays in the persistent AudioSpacesModal +
 * StageMiniPlayer (opened from here and across the app), so a stage keeps
 * running while you browse.
 *
 * Follows the Music/Explore page pattern: a sticky transparent
 * [data-feed-nav-outer] wrapper holding one [data-page-bento] glass surface
 * (branding + tab strip), with the feed content clipped at the bento's top
 * edge via useFeedSwallowClip (the "swallowing pill").
 */

import { useRef, useState } from 'react';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Radio, Clock, Users, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { LiveWaveform } from '@/components/app/audio/LiveWaveform';
import { PastStagesList } from '@/components/app/stages/PastStagesList';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { supabase } from '@/integrations/supabase/client';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import type { AudioSpace } from '@/types/audio-spaces.types';

type StagesTab = 'live' | 'recorded';

const STAGES_TABS: { icon: typeof Radio; label: string; value: StagesTab }[] = [
  { icon: Radio, label: 'Live', value: 'live' },
  { icon: Clock, label: 'Recorded', value: 'recorded' },
];

function LiveStageCard({
  space,
  isCurrent,
  isLoading,
  isPaper,
  onOpen,
}: {
  space: AudioSpace;
  isCurrent: boolean;
  isLoading: boolean;
  isPaper: boolean;
  onOpen: () => void;
}) {
  const totalListeners = Math.max(1, (space.speaker_count || 1) + (space.listener_count || 0));
  const avatar =
    buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
    buildAvatarCdnFallbackUrl(space.host_wallet_address || '');

  return (
    <button
      onClick={onOpen}
      disabled={isLoading}
      data-page-bento
      className={cn(
        'group text-left bg-zinc-900 rounded-2xl p-4 flex flex-col transition-colors disabled:opacity-60',
        'border border-transparent hover:border-white/15',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-red-400 text-xs font-medium">
            {isCurrent ? 'IN THIS STAGE' : 'LIVE'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400 text-xs">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
          <span>{totalListeners}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full ring-2 ring-white/20 overflow-hidden shrink-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white font-medium text-sm">
              {(space.host_username || space.host_wallet_address || 'U').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-zinc-500 text-[10px]">Hosted by</p>
          <p className="text-white text-xs font-medium truncate">
            @{space.host_username || space.host_wallet_address?.slice(0, 6)}
          </p>
        </div>
      </div>

      <h3 className="text-white font-semibold text-sm line-clamp-2">{space.title}</h3>
      {space.description && (
        <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{space.description}</p>
      )}

      <div className="mt-3 h-10 rounded-lg overflow-hidden">
        <LiveWaveform active barCount={60} barColor={isPaper ? '0, 0, 0' : undefined} />
      </div>
    </button>
  );
}

export default function StagesPage() {
  const [activeTab, setActiveTab] = useState<StagesTab>('live');
  const { liveSpaces, currentSpace, joinSpace, openModal, isLoading } = useStage();
  const { isAuthenticated } = useAuth();
  const { theme } = useAppTheme();
  // Paper themes need inked waveform bars (white bars vanish on a light card).
  const isPaper = theme === 'light' || theme === 'minimal';
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const isDraggingRef = useRef(false);
  const { layerRef: tabLayerRef, setRef: setTabRef, rect: tabRect, onScroll: onTabScroll } =
    useTabIndicator(activeTab, undefined, isDraggingRef);

  const handleOpenLive = async (space: AudioSpace) => {
    if (currentSpace?.id === space.id) {
      openModal('live');
      return;
    }
    setJoiningId(space.id);
    try {
      const ok = await joinSpace(space.id);
      if (ok) {
        openModal('live');
        supabase.rpc('increment_stage_listens', { p_space_id: space.id }).then(() => {});
      }
    } finally {
      setJoiningId(null);
    }
  };

  const renderLive = () => {
    const resume =
      currentSpace && !liveSpaces.some((s) => s.id === currentSpace.id) ? currentSpace : null;
    const hasAny = liveSpaces.length > 0 || !!resume;

    if (!hasAny) {
      // Nothing live is the common case, so don't dead-end here: offer the
      // create CTA and then fall back to recorded stages, which are always
      // worth listening to.
      return (
        <div className="space-y-3">
          <div data-page-bento className="bg-zinc-900 rounded-2xl p-8 text-center">
            <img src={stagesMicIcon} alt="" className="w-14 h-14 mx-auto mb-4 opacity-60 object-contain" />
            <h2 className="text-white font-semibold">No live stages right now</h2>
            <p className="text-zinc-500 text-sm mt-1 max-w-[320px] mx-auto">
              Start a stage and go live with your audience, or listen back to a recorded one below.
            </p>
            <button
              onClick={() => openModal('create')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Start a Stage
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-white font-semibold text-sm">Recorded stages</h3>
              <button
                onClick={() => setActiveTab('recorded')}
                className="text-zinc-400 hover:text-white text-sm transition-colors"
              >
                See all
              </button>
            </div>
            <PastStagesList />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        {resume && (
          <LiveStageCard
            key={resume.id}
            space={resume}
            isCurrent
            isLoading={joiningId === resume.id}
            isPaper={isPaper}
            onOpen={() => handleOpenLive(resume)}
          />
        )}
        {liveSpaces.map((space) => (
          <LiveStageCard
            key={space.id}
            space={space}
            isCurrent={currentSpace?.id === space.id}
            isLoading={joiningId === space.id || (isLoading && joiningId === space.id)}
            isPaper={isPaper}
            onOpen={() => handleOpenLive(space)}
          />
        ))}
      </div>
    );
  };

  // Swallow the feed at the sticky nav bento's top edge under the glass themes,
  // exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Drag-to-swipe for the tab indicator (after all hooks to avoid TDZ)
  const tabPositions = useRef<Partial<Record<StagesTab, HTMLElement | null>>>({});
  const {
    isDragging,
    indicatorRef,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  } = useDragTabIndicator({
    tabRect,
    tabLayerRef,
    tabButtonPositions: tabPositions,
    tabValues: STAGES_TABS.map((t) => t.value) as StagesTab[],
    activeTab,
    onTabChange: setActiveTab,
    isDraggingRef,
  });

  return (
    <div className="min-h-screen" data-stages-page>
      <SEOHead
        title="Stages — Live Audio Rooms on DeHub"
        description="Join live audio Stages, listen back to recorded conversations, and go live with your own room on DeHub — the decentralized, open source social platform."
        url="https://dehub.io/stages"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'DeHub Stages',
          url: 'https://dehub.io/stages',
          description: 'Live audio rooms and recorded conversations on DeHub.',
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />
      <h1 className="sr-only">DeHub Stages — Live Audio Rooms, Decentralised & Censorship Resistant</h1>

      {/* Sticky glass header — branding + tab strip (the swallowing pill) */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 bg-black z-50 px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-2 sm:p-3 overflow-visible">
          <div className="flex items-center justify-between px-1 pt-0.5 pb-2">
            <h2 className="font-bold text-white flex items-center gap-2">
              <img src={stagesMicIcon} alt="" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
              Stages
              {liveSpaces.length > 0 && (
                <span className="text-zinc-500 font-normal text-sm">({liveSpaces.length} live)</span>
              )}
            </h2>
            <button
              onClick={() => openModal('create')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-white text-sm font-medium transition-colors"
              title={isAuthenticated ? 'Start a stage' : 'Log in to start a stage'}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Start</span>
            </button>
          </div>

          {/* Tab strip */}
          <div ref={tabLayerRef} className="relative overflow-visible">
            <GlassIndicator ref={indicatorRef} rect={tabRect} enableTransition={!isDragging} />
            {tabRect.ready && (
              <div
                className="absolute z-30 cursor-grab active:cursor-grabbing"
                style={{
                  transform: `translate(${tabRect.x}px, ${tabRect.y}px)`,
                  width: tabRect.width,
                  height: tabRect.height,
                }}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              />
            )}
            <div
              className="relative z-20 flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide"
              onScroll={onTabScroll}
            >
              {STAGES_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={(el) => {
                      setTabRef(tab.value)(el);
                      tabPositions.current[tab.value] = el;
                    }}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      'relative z-40 flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-white',
                    )}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="p-2 sm:p-3 pb-32">
        {activeTab === 'live' ? renderLive() : <PastStagesList />}
      </div>
    </div>
  );
}
