import { WindowedFeedItem } from '@/components/app/feeds/WindowedFeedItem';
import '@/components/app/audio/audio-studio.css';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Music Feed Component
 * ====================
 * Displays music/audio uploads, music videos, and radio in the main feed.
 * 
 * @module components/app/feeds/MusicFeed
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { Mic2, Disc3 } from "lucide-react";
import Music from "@/components/ui/cut-icons/music";
import Radio from "@/components/ui/cut-icons/live";

import Play from "@/components/ui/cut-icons/play";
import ChevronRight from "@/components/ui/cut-icons/next";

import { AppState } from '@/components/app/AppState';
import { AnimatePresence, motion } from 'framer-motion';

import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';
import { MusicFeedSkeleton, MusicVideoCardSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
// Direct, not through the radio barrel: that barrel also re-exports the
// fullscreen visualizer, so importing one component through it pulled the whole
// canvas visualizer module onto the boot path.
import { RadioSection } from '@/components/app/radio/RadioSection';
import { StagesChart } from '@/components/app/music/StagesCarousel';
import { ChartDesk, type ChartDeskRow } from '@/components/app/music/ChartDesk';
import { CinematicMusic } from '@/components/app/music/CinematicMusic';
import { useCinematicPhone } from '@/hooks/use-cinematic-phone';
import { openStageModal } from '@/contexts/StageContext';

import { RadioStationCard } from '@/components/app/radio/RadioStationCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { searchNFTs, getBlockList, type DeHubNFT } from '@/lib/api/dehub';
import { isBlockedCreator, mapNFTToVideoItem } from '@/lib/music-feed-items';
import { resolveLikeCount, resolveViewCount } from '@/lib/engagement';
import { fetchMusicVideoChart, MUSIC_VIDEO_CHART_SORTS, type MusicVideoChartSort } from '@/lib/music-video-chart';
import { getPrimaryTags, getTopStations } from '@/lib/api/radio-browser';
import { getCuratedCarouselStations, type RadioStation } from '@/lib/api/radio-browser';
import { useAuth } from '@/contexts/AuthContext';
import type { VideoItem } from '@/types/feed.types';
import { usePersistedFeedFilter } from '@/hooks/use-persisted-feed-filter';

// ============================================================================
// TYPES
// ============================================================================

type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'radio' | 'stages';

const MUSIC_SUB_TABS: { icon?: typeof Music; customIcon?: string; label: string; value: MusicSubTab }[] = [
  { icon: Music, get label() { return _translateCopy("copy.a52ace420f21", { defaultValue: "All" }); }, value: 'all' },
  { icon: Disc3, get label() { return _translateCopy("copy.88980154513d", { defaultValue: "Tracks" }); }, value: 'tracks' },
  { icon: Play, get label() { return _translateCopy("copy.c9a9639463c2", { defaultValue: "Videos" }); }, value: 'videos' },
  { icon: Mic2, get label() { return _translateCopy("copy.6ac749b31f9a", { defaultValue: "Podcasts" }); }, value: 'podcasts' },
  { icon: Radio, get label() { return _translateCopy("copy.2a7dfeb2f2b0", { defaultValue: "Radio" }); }, value: 'radio' },
  { customIcon: stagesMicIcon, get label() { return _translateCopy("copy.3a17aa4e4abb", { defaultValue: "Stages" }); }, value: 'stages' },
];

const VIDEOS_PAGE_SIZE = 10; // Page size for videos tab - small for fast initial load
// Page size for the "All" tab carousels. Only CAROUSEL_INITIAL_VISIBLE items
// render up front and the rest are revealed on horizontal scroll, so fetching
// 50 rows per carousel only cost mount latency.
const CAROUSEL_PAGE_SIZE = 12;

// ============================================================================
// HELPERS
// ============================================================================

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EmptyState({ type }: { type: string }) {
  const { t: _copy } = _useCopy();
  return (
    <AppState
      icon="audio"
      title={_copy("copy.a97a4b610ce0", { defaultValue: "No {{value1}} yet", value1: type })}
      description={_copy("copy.b5d53e302645", { defaultValue: "Music content will appear here once creators start uploading." })}
      size="section"
    />
  );
}

function SectionHeader({ icon: Icon, title, count, onSeeAll }: { 
  icon: typeof Music; 
  title: string; 
  count?: number;
  onSeeAll?: () => void;
}) {
  const { t: _copy } = _useCopy();
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-bold text-white flex items-center gap-2">
        <Icon className="w-5 h-5" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-zinc-500 font-normal text-sm">({count})</span>
        )}
      </h3>
      {onSeeAll && (
        <button 
          onClick={onSeeAll}
          className="text-zinc-400 text-sm hover:text-white flex items-center gap-1"
        >{_copy("copy.14c21c5e3ffe", { defaultValue: "See all " })}<ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

type AudioChartSort = 'trending' | 'popular' | 'new';
type RadioChartSort = 'picks' | 'played' | 'voted' | 'trending';
// The radio chart ranks the top-voted stations the directory reports.
const RADIO_CHART_SIZE = 30;

function videoRows(items: VideoItem[], withViews: boolean): ChartDeskRow[] {
  return items.map(item => ({
    id: item.id,
    title: item.title,
    subtitle: withViews && item.views ? `${item.channel} · ${item.views}` : item.channel,
    thumb: item.thumbnail,
    trailing: item.duration,
  }));
}

function AudioChart({ items, isLoading, sort, onSort }: { items: VideoItem[]; isLoading: boolean; sort: AudioChartSort; onSort: (sort: AudioChartSort) => void }) {
  const { t: _copy } = _useCopy();
  return (
    <ChartDesk
      header={<SectionHeader icon={Disc3} title={_copy("copy.302b4ce5c73d", { defaultValue: "Audio Uploads" })} count={items.length} />}
      sorts={[
        { value: 'trending', label: _copy('music.mostPlayed', { defaultValue: 'Most played' }) },
        { value: 'popular', label: _copy('music.mostLiked', { defaultValue: 'Most liked' }) },
        { value: 'new', label: _copy('music.mostRecent', { defaultValue: 'Most recent' }) },
      ]}
      sort={sort}
      onSort={onSort}
      sortLabel={_copy('music.chartOrder', { defaultValue: 'Audio chart order' })}
      rows={videoRows(items, false)}
      isLoading={isLoading}
      empty={{ icon: 'audio', title: _copy("copy.cccec0619e2d", { defaultValue: "No audio uploads yet" }) }}
      renderSelected={id => { const item = items.find(i => i.id === id); return item ? <VideoCard key={item.id} video={item} hideActions /> : null; }}
    />
  );
}

function MusicVideoChart({ items, isLoading, sort, onSort, onSeeAll }: { items: VideoItem[]; isLoading: boolean; sort: MusicVideoChartSort; onSort: (sort: MusicVideoChartSort) => void; onSeeAll: () => void }) {
  const { t: _copy } = _useCopy();
  return (
    <ChartDesk
      header={<SectionHeader icon={Play} title={_copy("copy.ab4d6796dbbe", { defaultValue: "Music Videos" })} onSeeAll={items.length > 0 ? onSeeAll : undefined} />}
      sorts={MUSIC_VIDEO_CHART_SORTS}
      sort={sort}
      onSort={onSort}
      sortLabel={_copy('music.videoChartOrder', { defaultValue: 'Music video chart order' })}
      rows={videoRows(items, true)}
      isLoading={isLoading}
      thumbs="wide"
      empty={{ icon: 'videos', title: _copy("copy.26be785e21b7", { defaultValue: "No music videos yet" }) }}
      renderSelected={id => { const item = items.find(i => i.id === id); return item ? <VideoCard key={item.id} video={item} hideActions /> : null; }}
    />
  );
}

function RadioChart({ picks, onSeeAll }: { picks: RadioStation[]; onSeeAll: () => void }) {
  const { t: _copy } = _useCopy();
  const [sort, setSort] = useState<RadioChartSort>('picks');
  const { data: top = [], isLoading } = useQuery({
    queryKey: ['radio-chart-top'],
    queryFn: () => getTopStations(RADIO_CHART_SIZE),
    enabled: sort !== 'picks',
    staleTime: 60 * 60 * 1000,
  });
  const stations = useMemo(() => {
    if (sort === 'picks') return picks;
    const key = sort === 'played' ? 'clickcount' : sort === 'voted' ? 'votes' : 'clicktrend';
    return [...top].sort((a, b) => (b[key] || 0) - (a[key] || 0));
  }, [sort, picks, top]);
  return (
    <ChartDesk
      header={<SectionHeader icon={Radio} title={_copy("copy.42ee912bff23", { defaultValue: "Radio Stations" })} onSeeAll={onSeeAll} />}
      sorts={[
        { value: 'picks', label: _copy('music.radioPicks', { defaultValue: 'Our picks' }) },
        { value: 'played', label: _copy('music.mostPlayed', { defaultValue: 'Most played' }) },
        { value: 'voted', label: _copy('music.mostVoted', { defaultValue: 'Most voted' }) },
        { value: 'trending', label: _copy('music.trending', { defaultValue: 'Trending' }) },
      ]}
      sort={sort}
      onSort={setSort}
      sortLabel={_copy('music.radioChartOrder', { defaultValue: 'Radio chart order' })}
      rows={stations.map(station => ({
        id: station.stationuuid,
        title: station.name,
        subtitle: [getPrimaryTags(station.tags).join(', '), station.countrycode].filter(Boolean).join(' · '),
        thumb: station.favicon || undefined,
      }))}
      isLoading={sort === 'picks' ? picks.length === 0 : isLoading}
      thumbs="square"
      empty={{ icon: 'audio', title: _copy("copy.7c14e8607c11", { defaultValue: "Loading stations..." }) }}
      renderSelected={id => { const station = stations.find(s => s.stationuuid === id); return station ? <RadioStationCard station={station} /> : null; }}
    />
  );
}

function TracksCarousel() {
  const { t: _copy } = _useCopy();
  return (
    <div>
      <SectionHeader icon={Disc3} title={_copy("copy.88980154513d", { defaultValue: "Tracks" })} />
      <AppState icon="audio" title={_copy("copy.367c65fc9b46", { defaultValue: "No tracks yet" })} size="compact" />
    </div>
  );
}

function PodcastsCarousel() {
  const { t: _copy } = _useCopy();
  return (
    <div>
      <SectionHeader icon={Mic2} title={_copy("copy.6ac749b31f9a", { defaultValue: "Podcasts" })} />
      <AppState icon="stages" title={_copy("copy.729584c56940", { defaultValue: "No podcasts yet" })} size="compact" />
    </div>
  );
}

// All Section with all subsections
function AllSection({
  radioStations,
  isLoading,
  audioChart,
  videoChart,
  onGoToRadio,
  onOpenStages,
}: {
  radioStations: RadioStation[];
  isLoading: boolean;
  audioChart: React.ReactNode;
  videoChart: React.ReactNode;
  onGoToRadio: () => void;
  onOpenStages: () => void;
}) {
  // Show full skeleton on initial load (no chart loaded yet and still fetching)
  if (isLoading) {
    return <MusicFeedSkeleton />;
  }

  return (
    <div className="space-y-4 pb-32">
      {audioChart}
      {videoChart}
      <RadioChart picks={radioStations} onSeeAll={onGoToRadio} />
      <StagesChart onOpenStages={onOpenStages} />
      <TracksCarousel />
      <PodcastsCarousel />
    </div>
  );
}

// Music Videos Section - Full list with infinite scroll
function MusicVideosSection({ walletAddress }: { walletAddress: string | null }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['music-videos-infinite', walletAddress],
    queryFn: async ({ pageParam = 1 }) => {
      // Use 'new' sort for variety, shuffle client-side for randomness
      const response = await searchNFTs({
        category: 'Music',
        postType: 'video',
        unit: VIDEOS_PAGE_SIZE,
        page: pageParam,
        sortMode: 'new',
      });
      // Filter out blocked creators
      const filteredData = (response.data || []).filter((nft: DeHubNFT) => !isBlockedCreator(nft));
      return {
        items: filteredData,
        nextPage: (response.data?.length ?? 0) >= VIDEOS_PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Flatten pages to video items
  const videos = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page, pageIndex) => 
      page.items.map((nft, index) => mapNFTToVideoItem(nft, pageIndex * VIDEOS_PAGE_SIZE + index))
    );
  }, [data]);

  // Infinite scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-3 pb-32">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3">
            <MusicVideoCardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return <EmptyState type="music videos" />;
  }

  return (
    <div data-feed-root className="space-y-3 pb-32">
      {videos.map((video, index) => (
        <WindowedFeedItem
          key={video.id}
          data-feed-item
          className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-3"
          eager={index < 3} estimatedHeight={520}
          vanishOnDislike={video.id}
        >
          <VideoCard video={video} />
        </WindowedFeedItem>
      ))}
      
      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MusicFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

export function MusicFeed({ showFilters = false, isRefreshing = false }: MusicFeedProps) {
  const [activeSubTab, setActiveSubTab] = usePersistedFeedFilter<MusicSubTab>('music', 'subTab', 'all');
  const [chartSort, setChartSort] = usePersistedFeedFilter<AudioChartSort>('music', 'chartSort', 'trending');
  const [videoChartSort, setVideoChartSort] = useState<MusicVideoChartSort>('views');
  const musicSubIsDraggingRef = useRef(false);
  const { layerRef: musicSubTabLayerRef, setRef: setMusicSubTabRef, rect: musicSubTabRect, onScroll: onMusicSubTabScroll } = useTabIndicator(activeSubTab, undefined, musicSubIsDraggingRef);

  const { walletAddress, isAuthenticated } = useAuth();
  const cinematic = useCinematicPhone();

  // Fetch dynamic block list for authenticated users
  const { data: blockList } = useQuery({
    queryKey: ['block-list'],
    queryFn: getBlockList,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const blockedAddresses = useMemo(() => {
    if (!blockList?.length) return undefined;
    return new Set(blockList.map(u => u.address.toLowerCase()));
  }, [blockList]);

  // Fetch curated radio stations for carousel
  const { data: radioStations = [] } = useQuery({
    queryKey: ['radio-stations-curated'],
    queryFn: () => getCuratedCarouselStations(),
    // A fixed list of stations; there is nothing to refresh within a visit.
    staleTime: 60 * 60 * 1000,
  });


  // Fetch audio uploads for carousel (try both postType values)
  const { data: audioUploadsData, isLoading: isLoadingAudio } = useQuery({
    queryKey: ['music-audio-uploads', walletAddress, chartSort],
    queryFn: async () => {
      const [audioRes, feedAudioRes] = await Promise.all([
        searchNFTs({ postType: 'audio', unit: CAROUSEL_PAGE_SIZE, sortMode: chartSort }).catch(() => ({ data: [] })),
        searchNFTs({ postType: 'feed-audio', unit: CAROUSEL_PAGE_SIZE, sortMode: chartSort }).catch(() => ({ data: [] })),
      ]);
      // Merge and dedupe by tokenId. Blocked creators are filtered on render.
      const seen = new Set<string | number>();
      const merged: DeHubNFT[] = [];
      for (const nft of [...(audioRes.data || []), ...(feedAudioRes.data || [])]) {
        const tid = nft.tokenId || nft.id || nft.token_id;
        if (seen.has(tid)) continue;
        seen.add(tid);
        merged.push(nft);
      }
      return merged.sort((a, b) => chartSort === 'trending'
        ? resolveViewCount(b) - resolveViewCount(a)
        : chartSort === 'popular' ? resolveLikeCount(b) - resolveLikeCount(a)
        : Date.parse(b.createdAt || b.created_at || '') - Date.parse(a.createdAt || a.created_at || ''));
    },
    staleTime: 5 * 60 * 1000,
  });

  const audioUploads = useMemo(() => {
    if (!audioUploadsData) return [];
    return audioUploadsData
      .filter(nft => !isBlockedCreator(nft, blockedAddresses))
      .map((nft, index) => {
        const item = mapNFTToVideoItem(nft, index);
        return { ...item, isAudio: true };
      });
  }, [audioUploadsData, blockedAddresses]);

  // Music video charts, ranked on the server.
  const { data: videoChartData, isLoading: isLoadingVideoChart } = useQuery({
    queryKey: ['music-video-chart', walletAddress, videoChartSort],
    queryFn: () => fetchMusicVideoChart(videoChartSort),
    staleTime: 5 * 60 * 1000,
  });

  const videoChart = useMemo(() => (videoChartData || [])
    .filter(nft => !isBlockedCreator(nft, blockedAddresses))
    .map((nft, index) => mapNFTToVideoItem(nft, index)), [videoChartData, blockedAddresses]);


  const getEmptyLabel = () => {
    switch (activeSubTab) {
      case 'tracks': return 'tracks';
      case 'videos': return 'music videos';
      case 'podcasts': return 'podcasts';
      default: return 'music content';
    }
  };

  // Drag-to-swipe for music sub-tab indicator (must be before conditional returns)
  const musicSubTabPositions = useRef<Partial<Record<MusicSubTab, HTMLElement | null>>>({});

  const { isDragging: isMusicSubDragging, indicatorRef: musicSubIndicatorRef, handleDragStart: handleMusicSubDragStart, handleDragMove: handleMusicSubDragMove, handleDragEnd: handleMusicSubDragEnd } = useDragTabIndicator({
    tabRect: musicSubTabRect,
    tabLayerRef: musicSubTabLayerRef,
    tabButtonPositions: musicSubTabPositions,
    tabValues: MUSIC_SUB_TABS.map(t => t.value) as MusicSubTab[],
    activeTab: activeSubTab,
    onTabChange: setActiveSubTab,
    isDraggingRef: musicSubIsDraggingRef,
  });

  // System theme on phones: radio hero and a chart instead of carousels.
  if (cinematic && !isRefreshing) {
    return (
      <div className="px-2">
        <CinematicMusic radioStations={radioStations} blockedAddresses={blockedAddresses} showFilters={showFilters} />
      </div>
    );
  }

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <MusicFeedSkeleton />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSubTab) {
      case 'all':
        return (
          <AllSection
            radioStations={radioStations}
            isLoading={isLoadingAudio && isLoadingVideoChart}
            audioChart={<AudioChart items={audioUploads} isLoading={isLoadingAudio} sort={chartSort} onSort={setChartSort} />}
            videoChart={<MusicVideoChart items={videoChart} isLoading={isLoadingVideoChart} sort={videoChartSort} onSort={setVideoChartSort} onSeeAll={() => setActiveSubTab('videos')} />}
            onGoToRadio={() => setActiveSubTab('radio')}
            onOpenStages={() => openStageModal('browse')}
          />
        );
      case 'videos':
        return <MusicVideosSection walletAddress={walletAddress} />;
      case 'radio':
        return <RadioSection showFilters={showFilters} />;
      case 'stages':
        return (
          <div className="pb-32">
            <StagesChart onOpenStages={() => openStageModal('browse')} />
          </div>
        );
      case 'tracks':
      case 'podcasts':
      default:
        return <EmptyState type={getEmptyLabel()} />;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2.75rem)] lg:h-[calc(100vh-0rem)]">
      {/* Sub-tab Navigation - Only shown when filters toggled */}
      <AnimatePresence mode="wait">
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            data-feed-chrome
            className="flex-shrink-0 px-2 sm:px-3 pb-2 bg-black overflow-y-clip overflow-x-visible"
          >
            <div ref={musicSubTabLayerRef} className="relative overflow-visible">
              <GlassIndicator ref={musicSubIndicatorRef} rect={musicSubTabRect} borderRadius="0.5rem" enableTransition={!isMusicSubDragging} />
              {musicSubTabRect.ready && (
                <div
                  className="absolute z-30 cursor-grab active:cursor-grabbing"
                  style={{
                    transform: `translate(${musicSubTabRect.x}px, ${musicSubTabRect.y}px)`,
                    width: musicSubTabRect.width,
                    height: musicSubTabRect.height,
                  }}
                  onPointerDown={handleMusicSubDragStart}
                  onPointerMove={handleMusicSubDragMove}
                  onPointerUp={handleMusicSubDragEnd}
                  onPointerCancel={handleMusicSubDragEnd}
                />
              )}
              <div className="relative z-20 flex gap-1.5 overflow-x-auto scrollbar-hide pl-1 py-1" onScroll={onMusicSubTabScroll}>
                {MUSIC_SUB_TABS.map((tab) => {
                  const isActive = activeSubTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      ref={(el) => {
                        setMusicSubTabRef(tab.value)(el);
                        musicSubTabPositions.current[tab.value] = el;
                      }}
                      onClick={() => setActiveSubTab(tab.value)}
                      className={cn(
                        'relative z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs whitespace-nowrap font-medium',
                        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      <span className="relative z-10 flex items-center gap-1.5">
                        {tab.icon ? (
                          <tab.icon className="w-3.5 h-3.5" />
                        ) : tab.customIcon ? (
                          <img src={tab.customIcon} alt="" className="w-3.5 h-3.5 object-contain" />
                        ) : null}
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-3">
        {renderContent()}
      </div>

    </div>
  );
}
