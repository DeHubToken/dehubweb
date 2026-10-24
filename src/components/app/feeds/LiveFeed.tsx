import { TranslationText } from '@/components/TranslationText';
import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Live Feed Component
 * ===================
 * Displays live streams and TV channels with sub-tab navigation.
 * Fetches content from DeHub API and iptv-org.
 * 
 * @module components/app/feeds/LiveFeed
 */

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { Tv } from "lucide-react";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Radio from "@/components/ui/cut-icons/live";
import MicOff from "@/components/ui/cut-icons/mic-off";

import ChevronRight from "@/components/ui/cut-icons/next";
import Play from "@/components/ui/cut-icons/play";

import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useNavigate } from 'react-router-dom';
import { LiveFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/app/cards/LiveCard';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
// Direct, not through '@/components/app/tv': the barrel re-exports TVChat, which
// dragged the whole RealtimeChatPanel onto the first-paint path for a card the
// live feed only shows a thumbnail of. See scripts/boot-path-report.mjs.
import { TVPreviewCard } from '@/components/app/tv/TVPreviewCard';
import { StagesCarousel } from '@/components/app/music/StagesCarousel';
import { useQuery } from '@tanstack/react-query';
import { getTVChannelsByCountry } from '@/lib/api/live-tv';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { openStageModal } from '@/contexts/StageContext';
import { supabase } from '@/integrations/supabase/client';
import { toggleStageRecording, useStagePlayback } from '@/lib/stage-playback';
import { StageRateButton } from '@/components/app/stages/StageRateButton';
import type { AudioSpace } from '@/types/audio-spaces.types';
import { CinematicLive } from '@/components/app/feeds/CinematicLive';
import { useCinematicPhone } from '@/hooks/use-cinematic-phone';
import { usePersistedFeedFilter } from '@/hooks/use-persisted-feed-filter';
import { LIVE_GAMES, streamMatchesGame } from '@/constants/live-games';

// Only a stored game id or "all" is a valid saved category; ids from the old
// placeholder list fall back to all.
const CATEGORY_FILTER_VALUES: (string | null)[] = [null, ...LIVE_GAMES.map(g => g.id)];

interface LiveFeedProps {
  isRefreshing?: boolean;
  showFilters?: boolean;
}

export function LiveFeed({ isRefreshing = false, showFilters = false }: LiveFeedProps) {
  const { t: _copy } = _useCopy();

  const [selectedCategory, setSelectedCategory] = usePersistedFeedFilter<string | null>('live', 'category', null, CATEGORY_FILTER_VALUES);
  const game = LIVE_GAMES.find(g => g.id === selectedCategory) || null;
  const navigate = useNavigate();
  const cinematic = useCinematicPhone();


  // Fetch 5 TV channels for the carousel preview
  const { data: tvChannels = [] } = useQuery({
    queryKey: ['tv-channels-preview'],
    queryFn: () => getTVChannelsByCountry('all', 5),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch live content from DeHub API
  const {
    data: apiData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isApiLoading,
    isError,
    refetch,
    error,
  } = useDeHubLive(DEFAULT_DEHUB_LIVE_QUERY_OPTIONS);

  // Map API data to LiveStream items
  const streams = useMemo(() => {
    if (!apiData?.pages) return [];
    const allStreams = apiData.pages.flatMap(page => page.data || []);
    return allStreams.map((stream, index) => mapApiLiveStreamToLocal(stream, index));
  }, [apiData]);

  // No infinite scroll needed - streams are shown in a carousel

  // The category a stream carries is matched to a game by name, the same way
  // the phone layout (CinematicLive) and the app do it.
  const shownStreams = useMemo(
    () => (game ? streams.filter(s => streamMatchesGame(s.game, game)) : streams),
    [streams, game],
  );
  const streamsPerGame = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of LIVE_GAMES) counts[g.id] = streams.filter(s => streamMatchesGame(s.game, g)).length;
    return counts;
  }, [streams]);

  const { isAutoRetrying } = useAutoRetryFeed({
    itemCount: streams.length,
    isLoading: isApiLoading,
    isError,
    refetch,
  });

  const isLoading = isApiLoading || isRefreshing || isAutoRetrying;

  // Empty state component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ThemedIcon icon="live" alt="" className="w-16 h-16 object-contain mb-4 opacity-75" />
      <h3 className="text-white font-semibold text-lg mb-2"><TranslationText name="copy.d8c1b1fc3a37" fallback={"No Live Streams"} /></h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? _copy("copy.c9eebd6e986b", { defaultValue: "Unable to load streams. {{value1}}", value1: error?.message || _copy("copy.eea4fb33efd3", { defaultValue: "Please try again." }) })
          : _copy("copy.b0fa8ed37810", { defaultValue: "No one is streaming right now. Check back later!" })}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      ><TranslationText name="copy.0e9161011702" fallback={"Refresh"} /></button>
    </div>
  );

  const categoryItems = useMemo(() => [
    { key: 'all', label: _copy("copy.a52ace420f21", { defaultValue: "All" }) },
    ...LIVE_GAMES.map(g => ({ key: g.id, label: g.name })),
  ], [_copy]);

  // System theme on phones: who's live, top games and a grid of streams.
  if (cinematic) {
    return (
      <div className="px-2">
        <CinematicLive streams={streams} isLoading={isLoading} tvChannels={tvChannels} emptyState={<EmptyState />} showFilters={showFilters} />
      </div>
    );
  }

  return (
    <div data-feed-root className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-4">
      {/* Categories filter - toggles via tab re-click or settings icon */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div data-no-swipe data-feed-filter-panel className="relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-2 sm:px-3 py-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">{_copy("copy.b8b1d894c683", { defaultValue: "Categories" })}</span>
              <GlassFilterRow
                items={categoryItems}
                activeKey={selectedCategory || 'all'}
                onSelect={(key) => setSelectedCategory(key === 'all' ? null : key)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <LiveFeedSkeleton />
      ) : (
        <>
          {/* Streams */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-bold text-white flex items-center gap-2">
                <span data-live-pulse className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />{game ? game.name : _copy("copy.bfd297afbf9e", { defaultValue: "Streams" })}</h2>
              {game && (
                <button onClick={() => setSelectedCategory(null)} className="text-red-400 text-sm hover:underline">{_copy("copy.e1c32645f2f8", { defaultValue: "Show All" })}</button>
              )}
            </div>

            {streams.length === 0 ? (
              <EmptyState />
            ) : shownStreams.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-zinc-400">{_copy("copy.1de134eff461", { defaultValue: "No one is streaming " })}{game?.name}{_copy("copy.51599ee1733e", { defaultValue: " right now." })}</p>
            ) : (
              <SwipeableCarousel>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-12">
                  {shownStreams.map((stream) => (
                    <div key={stream.id} className="flex-shrink-0 w-72 sm:w-80">
                      <LiveCard stream={stream} />
                    </div>
                  ))}
                </div>
              </SwipeableCarousel>
            )}
          </div>

          {/* Stages Carousel - between Streams and TV */}
          <StagesCarousel onOpenStages={() => openStageModal('browse')} />

          {/* TV Carousel */}
          {tvChannels.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Tv className="w-4 h-4" />
                  TV
                </h2>
                <button 
                  onClick={() => navigate('/app/tv')}
                  className="text-zinc-400 text-sm hover:text-white transition-colors flex items-center gap-1"
                >{_copy("copy.e1c32645f2f8", { defaultValue: "Show All" })}<ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              <SwipeableCarousel>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-12">
                  {tvChannels.map((channel) => (
                    <div key={channel.id} className="flex-shrink-0 w-48 sm:w-56">
                      <TVPreviewCard channel={channel} />
                    </div>
                  ))}
                </div>
              </SwipeableCarousel>
            </div>
          )}

          {/* Categories Carousel - at bottom */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-bold text-white">{_copy("copy.b8b1d894c683", { defaultValue: "Categories" })}</h2>
            </div>
            
            <SwipeableCarousel>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-12">
                {LIVE_GAMES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
                    aria-pressed={selectedCategory === category.id}
                    className={cn('flex-shrink-0 group transition-opacity', game && game.id !== category.id && 'opacity-50')}
                  >
                    <div className={cn('w-24 sm:w-28 overflow-hidden rounded-xl', selectedCategory === category.id && 'ring-2 ring-red-500')}>
                      <img 
                        src={category.image} 
                        alt={category.name}
                        loading="lazy"
                        className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <div className="mt-1.5 text-left">
                      <p className="text-white text-xs font-medium truncate w-24 sm:w-28">{category.name}</p>
                      <div className="flex items-center gap-2 text-zinc-500 text-xs">
                        <span className="flex items-center gap-0.5">
                          <Radio className="w-3 h-3" />
                          {streamsPerGame[category.id] ?? 0}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </SwipeableCarousel>
          </div>

        </>
      )}

    </div>
  );
}

// Past Stages (recordings) section
//
// Playback goes through lib/stage-playback, the same engine as every other
// surface — this section was the last one holding a private `new Audio()`,
// which is why its rows kept playing after you opened a recording somewhere
// else, and why they had no scrub bar and no speed control of their own.
// Leaving the page stops a non-popped-out recording via the corner player's
// route gate, exactly as it does for the other surfaces.
function PastStagesSection({ stages }: { stages: AudioSpace[] }) {
  const { t: _copy } = _useCopy();
  const { spaceId: loadedId, paused: playbackPaused } = useStagePlayback();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="w-2 h-2 bg-white/40 rounded-full" />
        <h2 className="font-bold text-white">{_copy("copy.154370bd2e98", { defaultValue: "Past Stages" })}</h2>
      </div>
      <div className="space-y-2">
        {stages.map(stage => {
          const isLoaded = loadedId === stage.id;
          const isPlaying = isLoaded && !playbackPaused;

          return (
            <div key={stage.id} className="p-3 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-3">
                {/* Play button if recording exists */}
                {stage.recording_url ? (
                  <button
                    onClick={() => toggleStageRecording(stage)}
                    className="shrink-0 w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
                  >
                    {isPlaying ? (
                      <span className="flex gap-0.5">
                        <span data-live-pulse className="w-1 h-3 bg-white rounded-full animate-pulse" />
                        <span data-live-pulse className="w-1 h-3 bg-white rounded-full animate-pulse [animation-delay:0.15s]" />
                        <span data-live-pulse className="w-1 h-3 bg-white rounded-full animate-pulse [animation-delay:0.3s]" />
                      </span>
                    ) : (
                      <Play className="w-4 h-4 text-white ml-0.5" />
                    )}
                  </button>
                ) : (
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                    <MicOff className="w-4 h-4 text-white/20" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{stage.title}</p>
                  <p className="text-white/50 text-xs mt-0.5">
                    {stage.host_username || _copy("copy.e7a8aa2df7e5", { defaultValue: "Anonymous" })} · {stage.speaker_count || 0}{_copy("copy.a2010905262a", { defaultValue: " speakers" })}{stage.ended_at && ` · ${new Date(stage.ended_at).toLocaleDateString()}`}
                  </p>
                  {!stage.recording_url && (
                    <p className="text-white/25 text-xs mt-0.5">{_copy("copy.da849530a46b", { defaultValue: "No recording" })}</p>
                  )}
                </div>

                {stage.recording_url && <StageRateButton />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
