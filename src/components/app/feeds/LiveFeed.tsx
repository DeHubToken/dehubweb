/**
 * Live Feed Component
 * ===================
 * Displays live streams and TV channels with sub-tab navigation.
 * Fetches content from DeHub API and iptv-org.
 * 
 * @module components/app/feeds/LiveFeed
 */

import { useEffect, useRef, useMemo } from 'react';
import { RefreshCw, Radio, Eye, Loader2, Tv, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LiveFeedSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/app/cards';
import { useDeHubLive, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { TVChannelCard } from '@/components/app/tv';
import { useQuery } from '@tanstack/react-query';
import { getTVChannelsByCountry } from '@/lib/api/live-tv';

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
}

export function LiveFeed({ isRefreshing = false }: LiveFeedProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
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

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isLoading = isApiLoading || isRefreshing;

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

  return (
    <div className="p-2 sm:p-3 pt-0 sm:pt-0 space-y-4">
      {isLoading ? (
        <LiveFeedSkeleton />
      ) : (
        <>
          {/* Categories Carousel */}
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
              <>
                {streams.map((stream) => (
                  <LiveCard key={stream.id} stream={stream} />
                ))}
                
                {/* Infinite scroll loader */}
                <div ref={loaderRef} className="py-4 flex justify-center">
                  {isFetchingNextPage && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading more...</span>
                    </div>
                  )}
                  {!hasNextPage && streams.length > 0 && (
                    <p className="text-zinc-500 text-sm">No more streams</p>
                  )}
                </div>
              </>
            )}
          </div>

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
                      <TVChannelCard channel={channel} />
                    </div>
                  ))}
                </div>
              </SwipeableCarousel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
