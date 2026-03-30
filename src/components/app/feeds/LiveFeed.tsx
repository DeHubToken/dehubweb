/**
 * Live Feed Component
 * ===================
 * Displays live streams and TV channels with sub-tab navigation.
 * Fetches content from DeHub API and iptv-org.
 * 
 * @module components/app/feeds/LiveFeed
 */

import { useMemo, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAutoRetryFeed } from '@/hooks/use-auto-retry-feed';
import { RefreshCw, Radio, Eye, Tv, ChevronRight, Play, MicOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LiveFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/app/cards';
import { useDeHubLive, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { TVPreviewCard } from '@/components/app/tv';
import { StagesCarousel } from '@/components/app/music/StagesCarousel';
import { useQuery } from '@tanstack/react-query';
import { getTVChannelsByCountry } from '@/lib/api/live-tv';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useStage } from '@/contexts/StageContext';
import { supabase } from '@/integrations/supabase/client';
import type { AudioSpace } from '@/types/audio-spaces.types';

// Category images
import apexCategory from '@/assets/apex-category.png';
import codCategory from '@/assets/cod-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import gtaCategory from '@/assets/gta-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import minecraftCategory from '@/assets/minecraft-category.png';
import justchattingCategory from '@/assets/justchatting-category.png';
import lcsCategory from '@/assets/lcs-category.png';

// Categories data - all zeroed until API integration
const MOCK_CATEGORIES = [
  { id: 'just-chatting', name: 'Just Chatting', image: justchattingCategory, streams: 0, viewers: 0 },
  { id: 'lcs', name: 'Last Chad Standing', image: lcsCategory, streams: 0, viewers: 0 },
  { id: 'fortnite', name: 'Fortnite', image: fortniteCategory, streams: 0, viewers: 0 },
  { id: 'valorant', name: 'VALORANT', image: valorantCategory, streams: 0, viewers: 0 },
  { id: 'league', name: 'League of Legends', image: leagueCategory, streams: 0, viewers: 0 },
  { id: 'minecraft', name: 'Minecraft', image: minecraftCategory, streams: 0, viewers: 0 },
  { id: 'gta', name: 'Grand Theft Auto V', image: gtaCategory, streams: 0, viewers: 0 },
  { id: 'apex', name: 'Apex Legends', image: apexCategory, streams: 0, viewers: 0 },
  { id: 'cod', name: 'Call of Duty', image: codCategory, streams: 0, viewers: 0 },
];

interface LiveFeedProps {
  isRefreshing?: boolean;
  showFilters?: boolean;
}

export function LiveFeed({ isRefreshing = false, showFilters = false }: LiveFeedProps) {
  const { openModal: openStagesModal } = useStage();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const navigate = useNavigate();


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
  } = useDeHubLive({
    unit: 15,
    sortMode: 'recent',
  });

  // Map API data to LiveStream items
  const streams = useMemo(() => {
    if (!apiData?.pages) return [];
    const allStreams = apiData.pages.flatMap(page => page.data || []);
    return allStreams.map((stream, index) => mapApiLiveStreamToLocal(stream, index));
  }, [apiData]);

  // No infinite scroll needed - streams are shown in a carousel

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
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <RefreshCw className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">No Live Streams</h3>
      <p className="text-zinc-400 text-sm max-w-xs mb-4">
        {isError 
          ? `Unable to load streams. ${error?.message || 'Please try again.'}`
          : 'No one is streaming right now. Check back later!'}
      </p>
      <button 
        onClick={() => refetch()}
        className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  );

  const categoryItems = useMemo(() => [
    { key: 'all', label: 'All' },
    ...MOCK_CATEGORIES.map(c => ({ key: c.id, label: c.name })),
  ], []);

  return (
    <div className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-4">
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
            <div data-no-swipe className="relative rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-2 sm:px-3 py-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Categories</span>
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
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Streams
              </h2>
              <button className="text-red-400 text-sm hover:underline">Show All</button>
            </div>

            {streams.length === 0 ? (
              <EmptyState />
            ) : (
              <SwipeableCarousel>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-12">
                  {streams.map((stream) => (
                    <div key={stream.id} className="flex-shrink-0 w-72 sm:w-80">
                      <LiveCard stream={stream} />
                    </div>
                  ))}
                </div>
              </SwipeableCarousel>
            )}
          </div>

          {/* Stages Carousel - between Streams and TV */}
          <StagesCarousel onOpenStages={() => openStagesModal('browse')} />

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
                >
                  Show All
                  <ChevronRight className="w-4 h-4" />
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
              <h2 className="font-bold text-white">Categories</h2>
              <button className="text-red-400 text-sm hover:underline">Browse</button>
            </div>
            
            <SwipeableCarousel>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pr-12">
                {MOCK_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    className="flex-shrink-0 group"
                  >
                    <div className="w-24 sm:w-28 overflow-hidden rounded-xl">
                      <img 
                        src={category.image} 
                        alt={category.name}
                        className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <div className="mt-1.5 text-left">
                      <p className="text-white text-xs font-medium truncate w-24 sm:w-28">{category.name}</p>
                      <div className="flex items-center gap-2 text-zinc-500 text-xs">
                        <span className="flex items-center gap-0.5">
                          <Radio className="w-3 h-3" />
                          {category.streams}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3 h-3" />
                          {category.viewers}
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
function PastStagesSection({ stages }: { stages: AudioSpace[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (stage: AudioSpace) => {
    if (!stage.recording_url) return;

    if (playingId === stage.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(stage.recording_url);
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(stage.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="w-2 h-2 bg-white/40 rounded-full" />
        <h2 className="font-bold text-white">Past Stages</h2>
      </div>
      <div className="space-y-2">
        {stages.map(stage => (
          <div key={stage.id} className="p-3 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              {/* Play button if recording exists */}
              {stage.recording_url ? (
                <button
                  onClick={() => handlePlay(stage)}
                  className="shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
                >
                  {playingId === stage.id ? (
                    <span className="flex gap-0.5">
                      <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
                      <span className="w-1 h-3 bg-white rounded-full animate-pulse [animation-delay:0.15s]" />
                      <span className="w-1 h-3 bg-white rounded-full animate-pulse [animation-delay:0.3s]" />
                    </span>
                  ) : (
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  )}
                </button>
              ) : (
                <div className="shrink-0 w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                  <MicOff className="w-4 h-4 text-white/20" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{stage.title}</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {stage.host_username || 'Anonymous'} · {stage.speaker_count || 0} speakers
                  {stage.ended_at && ` · ${new Date(stage.ended_at).toLocaleDateString()}`}
                </p>
                {!stage.recording_url && (
                  <p className="text-white/25 text-xs mt-0.5">No recording</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
